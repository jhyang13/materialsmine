const util = require('util');
const fs = require('fs');
const XlsxFileManager = require('../utils/curation-utility');
const FileManager = require('../utils/fileManager');
const BaseSchemaObject = require('../../config/xlsx.json');
const { errorWriter } = require('../utils/logWriter');
const latency = require('../middlewares/latencyTimer');
const { BaseObjectSubstitutionMap, CurationEntityStateDefault, TestData } = require('../../config/constant');
const CuratedSamples = require('../models/curatedSamples');
const XlsxCurationList = require('../models/xlsxCurationList');
const XmlData = require('../models/xmlData');
const DatasetId = require('../models/datasetId');
const FileStorage = require('../middlewares/fileStorage');

exports.curateXlsxSpreadsheet = async (req, res, next) => {
  const { user, logger, query } = req;

  logger.info('curateXlsxSpreadsheet Function Entry:');

  if (!req.files?.uploadfile) {
    return next(errorWriter(req, 'Material template files not uploaded', 'curateXlsxSpreadsheet', 400));
  }
  const regex = /(?=.*?(master_template))(?=.*?(.xlsx)$)/gi;
  const xlsxFile = req.files.uploadfile.find((file) => regex.test(file?.path));

  if (!xlsxFile) {
    return next(errorWriter(req, 'Master template xlsx file not uploaded', 'curateXlsxSpreadsheet', 400));
  }

  try {
    const [validList, storedCurations] = await Promise.all([
      XlsxCurationList.find({}, null, { lean: true }),
      CuratedSamples.find({ user: user._id }, { object: 1 }, { lean: true })
    ]);

    const validListMap = generateCurationListMap(validList);
    const processedFiles = [];
    const result = await this.createMaterialObject(xlsxFile.path, BaseSchemaObject, validListMap, req.files.uploadfile, processedFiles);
    if (result?.count && req?.isParentFunction) return { errors: result.errors };
    if (result?.count) return res.status(400).json({ filename: `/api/files/${xlsxFile}?isFileStore=true`, errors: result.errors });

    const curatedAlready = storedCurations.find(
      object => object?.DATA_SOURCE?.Citation?.CommonFields?.Title === result?.DATA_SOURCE?.Citation?.CommonFields?.Title &&
      object?.DATA_SOURCE?.Citation?.CommonFields?.PublicationType === result?.DATA_SOURCE?.Citation?.CommonFields?.PublicationType);

    if (curatedAlready) return next(errorWriter(req, 'This had been curated already', 'curateXlsxSpreadsheet', 409));

    let datasets;
    if (query.dataset) {
      datasets = await DatasetId.findOne({ _id: query.dataset });
    } else if (result?.Control_ID) {
      const existingDataset = await DatasetId.findOne({ controlSampleID: result?.Control_ID });
      datasets = existingDataset ?? await DatasetId.create({ user, controlSampleID: result.Control_ID });
    }

    if (!datasets) {
      return next(errorWriter(req, `A sample must belong to a dataset. Dataset ID: ${query.dataset ?? null} not found`, 'curateXlsxSpreadsheet', 404));
    }
    const newCurationObject = new CuratedSamples({ object: result, user: user?._id, dataset: datasets._id });
    const curatedObject = await (await newCurationObject.save()).populate('user', 'displayName');

    await datasets.updateOne({ $push: { samples: curatedObject } });

    let xml = XlsxFileManager.xmlGenerator(JSON.stringify({ PolymerNanocomposite: curatedObject.object }));
    xml = `<?xml version="1.0" encoding="utf-8"?>\n  ${xml}`;
    await FileManager.writeFile(req, 'curation.xml', xml);
    const curatedSample = {
      sampleID: curatedObject._id,
      xml,
      user: curatedObject.user,
      groupId: curatedObject.dataset,
      isApproved: curatedObject.entityState !== CurationEntityStateDefault,
      status: curatedObject.curationState
    };

    if (req?.isParentFunction) return { curatedSample, processedFiles };
    latency.latencyCalculator(res);
    return res.status(200).json({ ...curatedSample });
  } catch (err) {
    next(errorWriter(req, err, 'curateXlsxSpreadsheet', 500));
  }
};

exports.bulkXlsxCurations = async (req, res, next) => {
  const { query, logger } = req;

  logger.info('bulkXlsxCurations Function Entry:');

  const regex = /.zip$/gi;
  const zipFile = req.files?.uploadfile?.find((file) => regex.test(file?.path));

  if (!zipFile) {
    return next(errorWriter(req, 'bulk curation zip file not uploaded', 'bulkXlsxCurations', 400));
  }

  if (query.dataset) {
    const dataset = await DatasetId.findOne({ _id: query.dataset });
    if (!dataset) return next(errorWriter(req, `Dataset ID: ${query.dataset ?? null} not found`, 'bulkXlsxCurations', 404));
  }
  const bulkErrors = [];
  const bulkCurations = [];
  try {
    const { folderPath, allfiles } = await XlsxFileManager.unZipFolder(req, zipFile.path);
    await processFolders(bulkCurations, bulkErrors, folderPath, req);
    if (bulkErrors.length) {
      const failedCuration = bulkErrors.map(curation => `mm_files/${curation.filename}`);
      for (const file of allfiles) {
        const filePath = `${folderPath}/${file?.path}`;
        if (file.type === 'file' && !failedCuration.includes(filePath)) {
          FileManager.deleteFile(filePath, req);
        }
      }
    } else {
      FileManager.deleteFolder(folderPath, req);
    }
    latency.latencyCalculator(res);
    return res.status(200).json({ bulkCurations, bulkErrors });
  } catch (err) {
    next(errorWriter(req, err, 'bulkXlsxCurations', 500));
  }
};

const processFolders = async (bulkCurations, bulkErrors, folder, req) => {
  const { folders, masterTemplates, curationFiles } = XlsxFileManager.readFolder(folder);
  await processSingleCuration(masterTemplates, curationFiles, bulkCurations, bulkErrors, req);

  if (folders.length) {
    for (const folder of folders) {
      await processFolders(bulkCurations, bulkErrors, folder, req);
    }
  }
};

const processSingleCuration = async (masterTemplates, curationFiles, bulkCurations, bulkErrors, req) => {
  let imageBucketArray = [];
  if (masterTemplates.length) {
    for (const masterTemplate of masterTemplates) {
      const newCurationFiles = [...curationFiles, masterTemplate];
      const newReq = {
        ...req,
        files: { uploadfile: newCurationFiles.map(file => ({ path: file })) },
        isParentFunction: true
      };
      const nextFnCallBack = fn => fn;
      const result = await this.curateXlsxSpreadsheet(newReq, {}, nextFnCallBack);

      if (result?.message || result?.errors) {
        bulkErrors.push({ filename: `/api/files/${masterTemplate.split('mm_files/').pop()}?isFileStore=true`, errors: result?.message ?? result?.errors });
      } else {
        bulkCurations.push(result.curatedSample);
        imageBucketArray = result.processedFiles.filter(file => /\.(jpe?g|tiff?|png)$/i.test(file));
      }
    }
  }

  if (imageBucketArray.length) {
    for (const image of imageBucketArray) {
      const file = {
        filename: image,
        mimetype: `image/${image.split('.').pop()}`,
        path: image
      };
      FileStorage.minioPutObject(file, req);
    }
  }
};

exports.getXlsxCurations = async (req, res, next) => {
  const { user, logger, query } = req;

  logger.info('getXlsxCurations Function Entry:');

  const { xlsxObjectId, xmlId } = query;
  const filter = {};

  if (user?.roles !== 'admin') filter.user = user._id;
  try {
    if (xmlId || xlsxObjectId) {
      let fetchedObject;
      if (xlsxObjectId) {
        const xlsxObject = await CuratedSamples.findOne({ _id: xlsxObjectId, ...filter }, null, { lean: true, populate: { path: 'user', select: 'givenName surName' } });

        if (!xlsxObject) return next(errorWriter(req, 'Curation sample not found', 'getXlsxCurations', 404));
        fetchedObject = xlsxObject.object;
      } else if (xmlId) {
        const xmlData = await XmlData.findOne({ _id: xmlId }, { xml_str: 1 }, { lean: true });
        if (!xmlData) return next(errorWriter(req, 'Sample xml not found', 'getXlsxCurations', 404));
        fetchedObject = XlsxFileManager.jsonGenerator(xmlData.xml_str);
      }
      latency.latencyCalculator(res);
      return res.status(200).json(fetchedObject);
    } else {
      const xlsxObjects = await CuratedSamples.find(filter, { user: 1, createdAt: 1, updatedAt: 1, _v: 1 }, { lean: true, populate: { path: 'user', select: 'givenName surName' } });
      return res.status(200).json(xlsxObjects);
    }
  } catch (err) {
    next(errorWriter(req, err, 'getXlsxCurations', 500));
  }
};

exports.getCurationXSD = async (req, res, next) => {
  const { isFile, isJson } = req.query;
  try {
    let jsonOBject = await createJsonObject(BaseSchemaObject, []);

    jsonOBject = { PolymerNanocomposite: jsonOBject };
    const jsonSchema = XlsxFileManager.jsonSchemaGenerator(jsonOBject);

    await FileManager.writeFile(req, 'curationSchema.json', JSON.stringify(jsonSchema));
    if (isJson) {
      latency.latencyCalculator(res);
      return res.status(201).json(jsonSchema);
    }

    let xsd = XlsxFileManager.jsonSchemaToXsdGenerator(jsonSchema);
    latency.latencyCalculator(res);

    const filePath = await FileManager.writeFile(req, 'schema.xsd', xsd);

    const parsedFile = await XlsxFileManager.parseXSDFile(req, filePath);
    if (isFile) {
      res.setHeader('Content-Type', 'application/octet-stream');
      res.setHeader('Content-Disposition', 'attachment; filename=curationschema.xsd');
      const stream = fs.createReadStream(parsedFile);
      return stream.pipe(res);
    }
    xsd = await FileManager.readFile(req, parsedFile);
    return res.status(201).json({ xsd });
  } catch (error) {
    next(errorWriter(req, error, 'getCurationXSD', 500));
  }
};

exports.updateXlsxCurations = async (req, res, next) => {
  const { user, body: { payload }, logger, query } = req;

  logger.info('updateXlsxCurations Function Entry:');

  try {
    const { xlsxObjectId } = query;
    const storedObject = await CuratedSamples.findOne({ _id: xlsxObjectId }, null, { lean: true, populate: { path: 'user', select: 'givenName surName' } });

    if (!storedObject) return next(errorWriter(req, `Curated sample ID: ${xlsxObjectId} not found`, 'updateXlsxCurations', 404));

    const baseUserObject = createBaseObject(BaseSchemaObject, storedObject.object);
    const isObjChanged = !util.isDeepStrictEqual(baseUserObject, payload);

    if (isObjChanged) {
      const filteredObject = filterNestedObject(payload);
      const updatedObject = await CuratedSamples.findOneAndUpdate({ user: user._id }, { $set: { object: filteredObject } }, { new: true, lean: true, populate: { path: 'user', select: 'givenName surName' } });
      return res.status(200).json(updatedObject);
    }

    return res.status(304).json({ message: 'No changes' });
  } catch (err) {
    next(errorWriter(req, err, 'updateXlsxCurations', 500));
  }
};

exports.deleteXlsxCurations = async (req, res, next) => {
  const { user, logger, query } = req;
  logger.info('deleteXlsxCurations Function Entry:');

  const { xlsxObjectId, dataset } = query;
  const filter = {};

  if (user?.roles !== 'admin') filter.user = user._id;

  try {
    if (xlsxObjectId) {
      const xlsxObject = await CuratedSamples.findOneAndDelete({ _id: xlsxObjectId, ...filter }, { lean: true });

      if (!xlsxObject) return next(errorWriter(req, 'Curation sample not found', 'deleteXlsxCurations', 404));

      await DatasetId.findOneAndUpdate({ _id: xlsxObject.dataset }, { $pull: { samples: xlsxObject._id } }, { new: true });
      return res.status(200).json({ message: `Curated sample ID: ${xlsxObjectId} successfully deleted` });
    } else if (dataset) {
      const datasets = await DatasetId.findOneAndDelete({ _id: dataset, ...filter }, { lean: true });

      if (!datasets) return next(errorWriter(req, `Dataset ID: ${query.dataset} not found`, 'deleteXlsxCurations', 404));

      await CuratedSamples.deleteMany({ _id: { $in: datasets.samples } });
      return res.status(200).json({ message: `Dataset ID: ${query.dataset} successfully deleted` });
    }
  } catch (err) {
    next(errorWriter(req, err, 'deleteXlsxCurations', 500));
  }
};

/**
 * @description Appends additional uploaded files & generate json object for xml table
 * @param {Object} parsedCSVData - The read csv data from the csv file
 * @param {Object} storedObject - The stored object retrieved from the database
 * @returns {Object} - Newly generated xml table json object
 */
const appendUploadedFiles = (parsedCSVData) => {
  const data = {};
  const element = parsedCSVData[0];
  const headerValues = Object.keys(element);
  const headers = headerValues.map((value, index) => {
    const header = {
      _attributes: {
        id: `${index}`
      },
      _text: value
    };
    return header;
  });

  const rows = parsedCSVData.map((row, index) => {
    const rowData = {
      _attributes: {
        id: index
      },
      column: Object.values(row).map((value, index) => ({ _attributes: { id: `${index}` }, _text: value }))
    };
    return rowData;
  });
  data.headers = { column: headers };
  data.rows = { row: rows };
  return data;
};

/**
 * @method createMaterialObject
 * @description Function to parse and curate xlsx object
 * @param {String} path - The path to the xlsx spreadsheet to be parsed
 * @param {Object} BaseObject - The json structure which holds all spreadsheet values and cell location
 * @param {Object} validListMap - The map of all valid curation lists
 * @param {Object} uploadedFiles - The list of all uploaded files data
 * @param {Object} errors - Object created to store errors that occur while parsing the spreadsheets
 * @returns {Object} - Newly curated object or errors that occur while  proces
 */
exports.createMaterialObject = async (path, BaseObject, validListMap, uploadedFiles, processedFiles, errors = {}) => {
  const sheetsData = {};
  const filteredObject = {};

  for (const property in BaseObject) {
    const propertyValue = BaseObject[property];

    if (propertyValue.type === 'replace_nested') {
      const objArr = [];

      for (const prop of propertyValue.values) {
        const newObj = await this.createMaterialObject(path, prop, validListMap, uploadedFiles, processedFiles, errors);
        const value = Object.values(newObj)[0];

        if (value) {
          objArr.push(value);
        }
      }

      if (objArr.length > 0) {
        filteredObject[BaseObjectSubstitutionMap[property] ?? property] = objArr;
      }
    } else if (Array.isArray(propertyValue?.values)) {
      let multiples = propertyValue.values;
      let cellValue;
      if (propertyValue.type === 'varied_multiples') {
        const [sheetName, row, col] = propertyValue.cellValue.replace(/[[\]]/g, '').split(/\||,/);

        if (!Object.getOwnPropertyDescriptor(sheetsData, sheetName)) {
          sheetsData[sheetName] = await XlsxFileManager.xlsxFileReader(path, sheetName);
        }

        // added plus(+) to parse as integer
        cellValue = sheetsData[sheetName]?.[+row]?.[+col];
        BaseObject[cellValue] = BaseObject[property];
        multiples = BaseObject[cellValue]?.values;
        delete BaseObject[property];
      }
      const objArr = [];
      for (const prop of multiples) {
        const newObj = await this.createMaterialObject(path, prop, validListMap, uploadedFiles, processedFiles, errors);

        if (Object.keys(newObj).length > 0) {
          objArr.push(newObj);
        }
      }

      if (objArr.length > 0) {
        filteredObject[cellValue ?? BaseObjectSubstitutionMap[property] ?? property] = objArr;
      }
    } else if (Array.isArray(propertyValue)) {
      const objArr = [];

      for (const prop of propertyValue) {
        const newObj = await this.createMaterialObject(path, prop, validListMap, uploadedFiles, processedFiles, errors);

        if (Object.keys(newObj).length > 0) {
          objArr.push(newObj);
        }
      }
      if (objArr.length > 0) {
        filteredObject[BaseObjectSubstitutionMap[property] ?? property] = objArr;
      }
    } else if (Object.getOwnPropertyDescriptor(propertyValue, 'cellValue')) {
      const [sheetName, row, col] = propertyValue.cellValue.replace(/[[\]]/g, '').split(/\||,/);

      if (!Object.getOwnPropertyDescriptor(sheetsData, sheetName)) {
        sheetsData[sheetName] = await XlsxFileManager.xlsxFileReader(path, sheetName);
      }

      // added plus(+) to parse as integer
      const cellValue = sheetsData[sheetName]?.[+row]?.[+col];

      if (cellValue) {
        if (Object.getOwnPropertyDescriptor(propertyValue, 'validList')) {
          const validListKey = propertyValue.validList;
          const validList = validListMap[validListKey];

          if (!validList && cellValue !== null) {
            filteredObject[BaseObjectSubstitutionMap[property] ?? property] = cellValue;
          } else if (validList?.includes(cellValue)) {
            filteredObject[BaseObjectSubstitutionMap[property] ?? property] = cellValue;
          } else if (cellValue !== null) {
            errors[validListKey] = 'Invalid value';
          }
        } else if (propertyValue.type === 'File') {
          const regex = new RegExp(`${cellValue}$`, 'gi');
          const file = uploadedFiles?.find((file) => regex.test(file?.path));

          if (file) {
            if (file?.mimetype === 'text/csv') {
              const jsonData = await XlsxFileManager.parseCSV(file.path);
              const data = appendUploadedFiles(jsonData);
              filteredObject.data = data;
            }
            filteredObject[BaseObjectSubstitutionMap[property] ?? property] = `/api/files/${file.path}?isStore=true`;
            processedFiles.push(file.path);
          } else {
            errors[cellValue] = 'file not uploaded';
          }
        } else {
          if (cellValue !== null) {
            filteredObject[BaseObjectSubstitutionMap[property] ?? property] = cellValue;
          }
        }
      } else if (cellValue === null && propertyValue?.default) {
        filteredObject[BaseObjectSubstitutionMap[property] ?? property] = propertyValue.default;
      }
    } else {
      const nestedObj = await this.createMaterialObject(path, propertyValue, validListMap, uploadedFiles, processedFiles, errors);
      const nestedObjectKeys = Object.keys(nestedObj);

      if (nestedObjectKeys.length > 0) {
        filteredObject[BaseObjectSubstitutionMap[property] ?? property] = nestedObj;
      }

      if (nestedObjectKeys.length === 1 && nestedObjectKeys[0] === 'description') {
        filteredObject[BaseObjectSubstitutionMap[property] ?? property] = nestedObj[nestedObjectKeys[0]];
      }
    }
  }

  if (Object.keys(errors)?.length) return { errors, count: Object.keys(errors)?.length };

  return filteredObject;
};

const createJsonObject = async (BaseObject, validListMap) => {
  const filteredObject = {};

  for (const property in BaseObject) {
    const propertyValue = BaseObject[property];

    if (propertyValue.type === 'replace_nested') {
      const objArr = [];

      for (const prop of propertyValue.values) {
        const newObj = await createJsonObject(prop, validListMap);
        const value = Object.values(newObj)?.[0];

        if (value) {
          objArr.push(value);
        }
      }

      if (objArr.length > 0) {
        filteredObject[BaseObjectSubstitutionMap[property] ?? property] = objArr;
      }
    } else if (Array.isArray(propertyValue?.values)) {
      const multiples = propertyValue.values;
      let cellValue;
      const objArr = [];
      for (const prop of multiples) {
        const newObj = await createJsonObject(prop, validListMap);

        if (Object.keys(newObj).length > 0) {
          objArr.push(newObj);
        }
      }

      if (propertyValue.type === 'varied_multiples') {
        const possibleValues = TestData.varied_multiples[property];
        possibleValues.forEach(cellValue => {
          filteredObject[cellValue] = objArr;
        });
        delete BaseObject[property];
      } else if (objArr.length > 0) {
        filteredObject[cellValue ?? BaseObjectSubstitutionMap[property] ?? property] = objArr;
      }
    } else if (Array.isArray(propertyValue)) {
      const objArr = [];

      for (const prop of propertyValue) {
        const newObj = await createJsonObject(prop, validListMap);

        if (Object.keys(newObj).length > 0) {
          objArr.push(newObj);
        }
      }
      if (objArr.length > 0) {
        filteredObject[BaseObjectSubstitutionMap[property] ?? property] = objArr;
      }
    } else if (Object.getOwnPropertyDescriptor(propertyValue, 'cellValue')) {
      if (propertyValue.type === 'File') {
        filteredObject[BaseObjectSubstitutionMap[property] ?? property] = TestData.File;
      } else {
        filteredObject[BaseObjectSubstitutionMap[property] ?? property] = TestData.String;
      }
    } else {
      const nestedObj = await createJsonObject(propertyValue, validListMap);
      const nestedObjectKeys = Object.keys(nestedObj);

      if (nestedObjectKeys.length > 0) {
        filteredObject[BaseObjectSubstitutionMap[property] ?? property] = nestedObj;
      }
    }
  }

  return filteredObject;
};

exports.getCurationSchemaObject = async (req, res, next) => {
  req.logger.info('getCurationSchemaObject Function Entry:');
  const { sheetName, getXSD, isFile, isJson } = req.query;
  if (getXSD || isFile || isJson) return next();

  const result = BaseSchemaObject[sheetName?.toUpperCase()]
    ? BaseSchemaObject[sheetName?.toUpperCase()]
    : BaseSchemaObject;

  return res.status(200).json(result);
};

exports.approveCuration = async (req, res, next) => {

};

exports.curationRehydration = async (req, res, next) => {

};

/**
 * @description Function to convert valid curation list to object mapping
 * @param {Object} validCurationList - The valid array/List of valid validCurationList
 * @returns {Object} - A valid list object
 */
const generateCurationListMap = (validCurationList) => {
  const validListObject = {};

  for (const validList of validCurationList) {
    validListObject[validList.field] = validList.values;
  }
  return validListObject;
};

/**
 * @description Function to filter out all null/undefined values in the object
 * @param {Object} curatedBaseObject - The curated base object which contains all fields based on the BaseSchemaObject
 * @returns {Object} The filtered curated base object stripped off all null values
 */
function filterNestedObject (curatedBaseObject) {
  const filteredObject = {};
  for (const property in curatedBaseObject) {
    const value = curatedBaseObject[property];
    if (Array.isArray(value)) {
      const objectArray = [];
      for (const property of value) {
        const newObj = filterNestedObject(property);
        if (Object.keys(newObj).length > 0) {
          objectArray.push(newObj);
        }
      }
      if (objectArray.length > 0) {
        filteredObject[property] = objectArray;
      }
    } else if (typeof value === 'object') {
      const nestedObj = filterNestedObject(value);

      if (Object.keys(nestedObj).length > 0) {
        filteredObject[property] = nestedObj;
      }
    } else if (value !== null) {
      filteredObject[property] = value;
    }
  }
  return filteredObject;
}

/**
 * @description Function to create schema object using the BaseObject
 * @param {Object} BaseObject - The json structure which holds all spreadsheet values and cell location
 * @param {Object} storedObject - The stored object retrieved from the database
 * @returns {Object} - Newly curated base object
 */
const createBaseObject = (BaseObject, storedObject) => {
  const curatedBaseObject = {};
  for (const property in BaseObject) {
    const propertyValue = BaseObject[property];
    if (Array.isArray(propertyValue?.values)) {
      const objectArray = propertyValue.values.map((BaseObject, i) => createBaseObject(BaseObject, storedObject?.[property]?.[i]));
      curatedBaseObject[BaseObjectSubstitutionMap[property] ?? property] = objectArray;
    } else if (Array.isArray(propertyValue)) {
      const objectArray = propertyValue.map((BaseObject, i) => createBaseObject(BaseObject, storedObject?.[property]?.[i]));
      curatedBaseObject[BaseObjectSubstitutionMap[property] ?? property] = objectArray;
    } else if (propertyValue.cellValue) {
      if (storedObject?.[property]) {
        curatedBaseObject[BaseObjectSubstitutionMap[property] ?? property] = storedObject[property];
      } else {
        curatedBaseObject[BaseObjectSubstitutionMap[property] ?? property] = null;
      }
    } else {
      const nestedObj = createBaseObject(propertyValue, storedObject?.[BaseObjectSubstitutionMap[property] ?? property]);

      if (Object.keys(nestedObj).length > 0) {
        curatedBaseObject[BaseObjectSubstitutionMap[property] ?? property] = nestedObj;
      }
    }
  }
  return curatedBaseObject;
};
