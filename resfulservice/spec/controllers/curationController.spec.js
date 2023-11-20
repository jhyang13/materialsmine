const util = require("util");
const fs = require("fs");
const chai = require("chai");
const sinon = require("sinon");
const Xmljs = require("xml-js");
const {
  user,
  correctXlsxFile,
  mockBulkCurationZipFile,
  wrongXlsxFile,
  mockCurationList,
  mockCuratedXlsxObject,
  mockJsonObject,
  mockJsonObjectErrored,
  mockjsonError,
  mockCurateObject,
  fetchedCuratedXlsxObject,
  mockSheetData,
  mockSheetData2,
  updatedCuratedXlsxObject,
  mockBaseObject,
  mockJsonStructure,
  mockCurationListMap,
  mockSheetData3,
  mockSheetData4,
  mockSheetData5,
  mockJsonStructure2,
  mockJsonStructure4,
  mockJsonStructure5,
  mockUploadedFiles,
  mockDatasetId,
  mockXmlData,
  mockCSVData,
  mockUnzippedFolder,
  mockCurationError,
  mockBulkCuration1,
  mockBulkCuration2,
  mockJsonSchema,
  mockReadFolder,
  mockProcessedFiles,
  mockCurationStream,
  next,
} = require("../mocks");
const XlsxObject = require("../../src/models/curatedSamples");
const XlsxCurationList = require("../../src/models/xlsxCurationList");
const DatasetId = require("../../src/models/datasetId");
const XmlData = require("../../src/models/xmlData");
const XlsxFileManager = require("../../src/utils/curation-utility");
const FileManager = require("../../src/utils/fileManager");
const XlsxController = require("../../src/controllers/curationController");
const FileController = require("../../src/controllers/fileController");
const {
  createMaterialObject,
} = require("../../src/controllers/curationController");
const { logger } = require("../common/utils");
const latency = require("../../src/middlewares/latencyTimer");
const FileStorage = require("../../src/middlewares/fileStorage");

const { expect } = chai;

describe("Curation Controller", function () {
  afterEach(() => sinon.restore());

  const req = {
    logger,
    user,
    files: {},
    body: {},
    query: {}
  };

  const res = {
    header: () => {},
    status: () => {},
    json: () => {},
    send: () => {},
    setHeader: () => {},
  };

  context("curateXlsxSpreadsheet", () => {
    it("should return a 400 error if master_template.xlsx file is not uploaded", async function () {
      req.files.uploadfile = wrongXlsxFile;
      sinon.stub(res, "status").returnsThis();
      sinon.stub(res, "json").returnsThis();
      sinon.stub(XlsxObject, "find").returns([]);
      const result = await XlsxController.curateXlsxSpreadsheet(req, res, next);

      expect(result).to.have.property("message");
      expect(result.message).to.equal(
        "Master template xlsx file not uploaded",
        "createXlsxObject"
      );
    });

    it("should return a 400 error if curatedjsonObject is not sent", async function () {
      req.files.uploadfile = wrongXlsxFile;
      req.body = { curatedjsonObject: null };
      req.query = { dataset: "64902493388ad3a79b54b58e", isBaseObject: true };
      sinon.stub(res, "status").returnsThis();
      sinon.stub(res, "json").returnsThis();
      sinon.stub(XlsxObject, "find").returns([]);
      const result = await XlsxController.curateXlsxSpreadsheet(req, res, next);

      expect(result).to.have.property("message");
      expect(result.message).to.equal(
        "Base Schema curation object not sent",
        "createXlsxObject"
      );
    });

    it("should return a 404 error if provided dataset ID is not found in the database", async function () {
      req.files.uploadfile = correctXlsxFile;
      req.query = { dataset: "583e3d6ae74a1d205f4e3fd3" };
      sinon.stub(res, "status").returnsThis();
      sinon.stub(res, "json").returnsThis();
      sinon.stub(XlsxObject, "find").returns([]);
      sinon.stub(XlsxCurationList, "find").returns(mockCurationList);
      sinon.stub(XlsxFileManager, 'xlsxFileReader').returns(mockSheetData);
      sinon
        .stub(XlsxController, "createMaterialObject")
        .returns(mockCuratedXlsxObject);
      sinon.stub(DatasetId, "findOne").returns(null);
      const result = await XlsxController.curateXlsxSpreadsheet(req, res, next);
      expect(result).to.have.property("message");
      expect(result.message).to.equal(
        `A sample must belong to a dataset. Dataset ID: ${
          req.query.dataset ?? null
        } not found`,
        "createXlsxObject"
      );
    });

    it("should return a 400 error if error is found while processing the parsing spreadsheet", async function () {
      req.files.uploadfile = correctXlsxFile;
      req.query = { dataset: "583e3d6ae74a1d205f4e3fd3" };
      sinon.stub(res, "status").returnsThis();
      sinon.stub(res, "json").returns({ errors: { Origin: "invalid value" } });
      sinon.stub(XlsxObject, "find").returns([]);
      sinon.stub(XlsxFileManager, 'xlsxFileReader').returns(mockSheetData);
      sinon.stub(XlsxCurationList, "find").returns(mockCurationList);
      sinon.stub(latency, "latencyCalculator").returns(true);
      sinon
        .stub(XlsxController, "createMaterialObject")
        .returns({ errorCount: 1, errors: { Origin: "invalid value" } });

      const result = await XlsxController.curateXlsxSpreadsheet(req, res, next);
      expect(result).to.have.property("errors");
    });

    it("should return a 400 error if error is found while processing the parsing spreadsheet", async function () {
      req.files.uploadfile = correctXlsxFile;
      req.query = { dataset: "583e3d6ae74a1d205f4e3fd3" };
      sinon.stub(XlsxObject, "find").returns([]);
      sinon.stub(XlsxFileManager, 'xlsxFileReader').returns(mockSheetData);
      sinon.stub(XlsxCurationList, "find").returns(mockCurationList);
      sinon
        .stub(XlsxController, "createMaterialObject")
        .returns({ errorCount: 1, errors: { Origin: "invalid value" } });

      const result = await XlsxController.curateXlsxSpreadsheet(
        { ...req, isParentFunction: true },
        res,
        next
      );
      expect(result).to.have.property("errors");
    });

    it.skip("should return a 409 conflict error if curated sheet has same title and publication year", async function () {
      req.files.uploadfile = correctXlsxFile;
      sinon.stub(res, "status").returnsThis();
      sinon.stub(res, "json").returnsThis();
      sinon.stub(XlsxFileManager, 'xlsxFileReader').returns(mockSheetData);
      sinon.stub(XlsxObject, "find").returns([{ object: mockCuratedXlsxObject }]);
      const result = await XlsxController.curateXlsxSpreadsheet(req, res, next);
      expect(result).to.have.property("message");
    });

    it.skip("should return a 409 conflict error when base object title and publication year both already exists", async function () {
      req.body = { curatedjsonObject: mockJsonObjectErrored.curatedjsonObject };
      req.query = { dataset: "64902493388ad3a79b54b58e", isBaseObject: true };
      sinon.stub(res, "status").returnsThis();
      sinon.stub(res, "json").returnsThis();
      sinon.stub(XlsxObject, "find").returns([{ object: mockCuratedXlsxObject }]);
      const result = await XlsxController.curateXlsxSpreadsheet(req, res, next);

      expect(result).to.have.property("message");
      expect(result.message).to.equal(
        'This had been curated already',
        "createXlsxObject"
      );
    });

    it("should return error when base object has error fields", async function () {
      req.body = { curatedjsonObject: mockJsonObjectErrored };
      req.query = { dataset: "64902493388ad3a79b54b58e", isBaseObject: true };
      sinon.stub(res, "status").returnsThis();
      sinon.stub(res, "json").returns(mockjsonError);
      sinon.stub(XlsxObject, "find").returns([]);
      sinon.stub(latency, "latencyCalculator").returns(true);

      const result = await XlsxController.curateXlsxSpreadsheet(req, res, next);

      expect(result).to.have.property("fieldError");
    });

    it("should post a new curation when curationJsonObject is sent in the request body", async function () {
      req.body = { curatedjsonObject: mockJsonObject };
      req.query = { dataset: "64902493388ad3a79b54b58e", isBaseObject: true };
      sinon.stub(res, "status").returnsThis();
      sinon.stub(res, "json").returns(mockCurateObject);
      sinon.stub(XlsxObject, "find").returns([]);
      sinon.stub(XlsxCurationList, "find").returns(mockCurationList);
      sinon
        .stub(DatasetId, "findOne")
        .returns({ ...mockDatasetId, updateOne: sinon.stub().returns(true) });
      sinon.stub(FileController, "fileContent").returns(mockCurationStream);
      sinon.stub(XlsxFileManager, "parseCSV").returns(mockCSVData);
      sinon
        .stub(XlsxObject.prototype, "save")
        .callsFake(() => fetchedCuratedXlsxObject);
      sinon.stub(FileController, 'deleteFile').resolves(true);
      sinon.stub(latency, "latencyCalculator").returns(true);
      sinon.stub(Xmljs, "json2xml").returns(fetchedCuratedXlsxObject);

      const result = await XlsxController.curateXlsxSpreadsheet(req, res, next);
      expect(result).to.have.property("xml");
      expect(result).to.have.property("user");
    });

    it("should curate master template", async function () {
      req.files.uploadfile = correctXlsxFile;
      req.query = { dataset: null };
      sinon.stub(res, "status").returnsThis();
      sinon.stub(res, "json").returns(mockCurateObject);
      sinon.stub(XlsxObject, "find").returns([]);
      sinon.stub(XlsxCurationList, "find").returns(mockCurationList);
      sinon.stub(XlsxFileManager, 'xlsxFileReader').returns(mockSheetData);
      sinon.stub(DatasetId, "findOne").returns(null);
      sinon
        .stub(DatasetId, "create")
        .returns({ ...mockDatasetId, updateOne: sinon.stub().returns(true) });
      sinon
        .stub(XlsxController, "createMaterialObject")
        .returns(mockCuratedXlsxObject);
      sinon
        .stub(XlsxObject.prototype, "save")
        .callsFake(() => fetchedCuratedXlsxObject);
      sinon.stub(FileController, 'deleteFile').resolves(true);
      sinon.stub(latency, "latencyCalculator").returns(true);
      sinon.stub(Xmljs, "json2xml").returns(fetchedCuratedXlsxObject);

      const result = await XlsxController.curateXlsxSpreadsheet(req, res, next);

      expect(result).to.have.property("xml");
      expect(result).to.have.property("user");
    });

    it("should curate master template when called by bulk controller", async function () {
      req.files.uploadfile = correctXlsxFile;
      req.isParentFunction = true;
      sinon.stub(XlsxObject, "find").returns([]);
      sinon.stub(XlsxCurationList, "find").returns(mockCurationList);
      sinon.stub(XlsxFileManager, 'xlsxFileReader').returns(mockSheetData);
      sinon
        .stub(DatasetId, "findOne")
        .returns({ ...mockDatasetId, updateOne: sinon.stub().returns(true) });
      sinon
        .stub(XlsxController, "createMaterialObject")
        .returns(mockCuratedXlsxObject);
      sinon
        .stub(XlsxObject.prototype, "save")
        .callsFake(() => fetchedCuratedXlsxObject);
      sinon.stub(Xmljs, "json2xml").returns(fetchedCuratedXlsxObject);
      const result = await XlsxController.curateXlsxSpreadsheet(req, res, next);

      expect(result).to.have.property("curatedSample");
      expect(result).to.have.property("processedFiles");
    });

    it("should return a 500 server error when database throws an error", async function () {
      req.files.uploadfile = correctXlsxFile;
      const nextSpy = sinon.spy();
      sinon.stub(res, "status").returnsThis();
      sinon.stub(res, "json").returnsThis();
      sinon.stub(XlsxObject, "find").throws();

      await XlsxController.curateXlsxSpreadsheet(req, res, nextSpy);
      sinon.assert.calledOnce(nextSpy);
    });
  });

  context("bulkXlsxCurations", () => {
    it("should return a 400 error if zip file is not uploaded", async function () {
      req.files.uploadfile = wrongXlsxFile;
      sinon.stub(res, "status").returnsThis();
      sinon.stub(res, "json").returnsThis();
      const result = await XlsxController.bulkXlsxCurations(
        req,
        res,
        (fn) => fn
      );

      expect(result).to.have.property("message");
      expect(result.message).to.equal("bulk curation zip file not uploaded");
    });

    it("should bulk curate folders when curation returns errors", async function () {
      req.files.uploadfile = mockBulkCurationZipFile;
      req.query = { dataset: mockDatasetId._id };
      sinon.stub(res, "status").returnsThis();
      sinon.stub(res, "json").returns(mockBulkCuration1);
      sinon.stub(DatasetId, "findOne").returns(mockDatasetId);
      sinon.stub(XlsxFileManager, "unZipFolder").returns(mockUnzippedFolder);
      sinon
        .stub(XlsxController, "curateXlsxSpreadsheet")
        .returns(mockCurationError);
      sinon
        .stub(XlsxFileManager, "readFolder")
        .returns({ ...mockReadFolder, folders: [] });
      sinon.stub(FileStorage, "minioPutObject").returns(true);
      sinon.stub(FileManager, "deleteFile").returns(true);
      sinon.stub(FileManager, "deleteFolder").returns(true);
      sinon.stub(latency, "latencyCalculator").returns(true);

      const result = await XlsxController.bulkXlsxCurations(
        req,
        res,
        (fn) => fn
      );

      expect(result).to.have.property("bulkCurations");
      expect(result).to.have.property("bulkErrors");
      expect(result.bulkCurations).to.be.an("Array");
      expect(result.bulkErrors).to.be.an("Array");
    });

    it("should return 404 not found error when datasetId provided is not present in the database", async function () {
      req.files.uploadfile = mockBulkCurationZipFile;
      req.query = { dataset: mockDatasetId._id };
      sinon.stub(res, "status").returnsThis();
      sinon.stub(res, "json").returns(mockBulkCuration1);
      sinon.stub(DatasetId, "findOne").returns(null);

      const result = await XlsxController.bulkXlsxCurations(
        req,
        res,
        (fn) => fn
      );
      expect(result).to.have.property("message");
      expect(result.message).to.equal(
        `Dataset ID: ${req.query.dataset ?? null} not found`,
        "bulkXlsxCurations"
      );
    });

    it("should bulk curate folders when successful curation when files and folders in root folder", async function () {
      req.files.uploadfile = mockBulkCurationZipFile;
      req.query = { dataset: null };
      sinon.stub(res, "status").returnsThis();
      sinon.stub(res, "json").returns(mockBulkCuration2);
      sinon.stub(DatasetId, "findOne").returns(mockDatasetId);
      sinon.stub(XlsxFileManager, "unZipFolder").returns(mockUnzippedFolder);
      sinon
        .stub(XlsxController, "curateXlsxSpreadsheet")
        .returns({
          curatedSample: mockCurateObject,
          processedFiles: { toBeUploaded: mockProcessedFiles },
        });
      const readFolderStub = sinon.stub(XlsxFileManager, "readFolder");
      readFolderStub.onFirstCall().returns(mockReadFolder);
      readFolderStub.onSecondCall().returns({ ...mockReadFolder, folders: [] });
      sinon.stub(FileManager, "deleteFolder").returns(true);
      sinon.stub(FileManager, "deleteFile").returns(true);
      sinon.stub(latency, "latencyCalculator").returns(true);
      sinon.stub(FileStorage, "minioPutObject").returns(true);

      const result = await XlsxController.bulkXlsxCurations(
        req,
        res,
        (fn) => fn
      );

      expect(result).to.have.property("bulkCurations");
      expect(result).to.have.property("bulkErrors");
      expect(result.bulkCurations).to.be.an("Array");
      expect(result.bulkErrors).to.be.an("Array");
    });

    it("should return a 500 server error when database throws an error", async function () {
      req.files.uploadfile = mockBulkCurationZipFile;
      const nextSpy = sinon.spy();
      sinon.stub(res, "status").returnsThis();
      sinon.stub(res, "json").returnsThis();
      sinon.stub(XlsxFileManager, "unZipFolder").throws();
      sinon.stub(latency, "latencyCalculator").returns(true);

      await XlsxController.bulkXlsxCurations(req, res, nextSpy);
      sinon.assert.calledOnce(nextSpy);
    });
  });

  context("Retrieve curations", () => {
    it("should return 404 not found error if req.params ID is invalid", async () => {
      req.params = { curationId: "a90w49a40ao4094k4aed" };
      req.query = { isNew: "true" };
      sinon.stub(XlsxObject, "findOne").returns(null);
      const result = await XlsxController.getXlsxCurations(req, res, next);
      expect(result).to.have.property("message");
      expect(result.message).to.equal("Curation sample not found");
    });

    it("should return 404 not found error if req.param ID is invalid", async () => {
      req.params = { curationId: "a90w49a40ao4094k4aed" };
      req.query = { isNew: "false" };
      sinon.stub(XmlData, "findOne").returns(null);
      const result = await XlsxController.getXlsxCurations(req, res, next);
      expect(result).to.have.property("message");
      expect(result.message).to.equal("Sample xml not found");
    });

    it("returns a curation data when a valid req.param ID is provided", async () => {
      req.params = { curationId: "a90w49a40ao4094k4aed" };
      req.query = { isNew: "true" };
      sinon.stub(res, "status").returnsThis();
      sinon.stub(res, "json").returns(fetchedCuratedXlsxObject);
      sinon.stub(XlsxObject, "findOne").returns(fetchedCuratedXlsxObject);
      sinon.stub(latency, "latencyCalculator").returns(true);

      const result = await XlsxController.getXlsxCurations(req, res, next);

      expect(result).to.be.an("Object");
      expect(result).to.have.property("object");
      expect(result).to.have.property("user");
    });

    it("should return sheet curation when sheetName query is provided", async () => {
      req.params = { curationId: "a90w49a40ao4094k4aed" };
      req.query = { isNew: "false", sheetName: "ID" };
      sinon.stub(res, "status").returnsThis();
      sinon.stub(res, "json").returns(mockJsonObject.curatedjsonObject.ID);
      sinon.stub(XmlData, "findOne").returns(mockXmlData);
      sinon.stub(latency, "latencyCalculator").returns(true);

      const result = await XlsxController.getXlsxCurations(req, res, next);

      expect(result).to.be.an("Object");
      expect(result).to.have.property("cellValue");
      expect(result).to.have.property("required");
      expect(result).to.have.property("type");
    });

    it("returns curated object when an ID is provided and user is admin", async () => {
      req.params = { curationId: "a90w49a40ao4094k4aed" };
      req.query = { isNew: "true" };
      req.user.roles = "admin";
      sinon.stub(res, "status").returnsThis();
      sinon.stub(res, "json").returns(fetchedCuratedXlsxObject);
      sinon.stub(XlsxObject, "findOne").returns(fetchedCuratedXlsxObject);
      sinon.stub(latency, "latencyCalculator").returns(true);

      const result = await XlsxController.getXlsxCurations(req, res, next);

      expect(result).to.be.an("Object");
      expect(result).to.have.property("object");
      expect(result).to.have.property("user");
    });

    it("should return curation object when an it is an old curation", async () => {
      req.params = { curationId: "a90w49a40ao4094k4aed" };
      req.query = { isNew: "false" };
      sinon.stub(res, "status").returnsThis();
      sinon.stub(res, "json").returns(mockJsonObject.curatedjsonObject);
      sinon.stub(XmlData, "findOne").returns(mockXmlData);
      sinon.stub(latency, "latencyCalculator").returns(true);

      const result = await XlsxController.getXlsxCurations(req, res, next);

      expect(result).to.be.an("Object");
      expect(result).to.have.property("ID");
      expect(result).to.have.property("DATA ORIGIN");
    });

    it("should return a 500 server error when database throws an error", async function () {
      req.query = { curationId: "a90w49a40ao4094k4aed", isNew: 'true' };
      const nextSpy = sinon.spy();
      sinon.stub(res, "status").returnsThis();
      sinon.stub(res, "json").returnsThis();
      sinon.stub(XlsxObject, "findOne").throws();

      await XlsxController.getXlsxCurations(req, res, nextSpy);
      sinon.assert.calledOnce(nextSpy);
    });
  });

  context("Retrieve curation XSD", () => {
    it('should return json Schema Definition when "isJson" query params is passed', async () => {
      req.query = { isJson: true, isFile: false };
      sinon.stub(res, "status").returnsThis();
      sinon.stub(res, "json").returns(mockJsonSchema);
      sinon
        .stub(XlsxFileManager, "jsonSchemaGenerator")
        .returns(mockJsonSchema);
      sinon.stub(fs.promises, "writeFile").returns(true);
      sinon.stub(latency, "latencyCalculator").returns(true);

      const result = await XlsxController.getCurationXSD(req, res, next);
      expect(result).to.be.an("Object");
      expect(result).to.have.property("$schema");
      expect(result).to.have.property("properties");
      expect(result.properties).to.have.property("PolymerNanocomposite");
      expect(result.properties.PolymerNanocomposite).to.be.an("Object");
    });

    it('should return a downloadable file stream when "isFile" query params is passed', async () => {
      req.query = { isJson: false, isFile: true };
      sinon.stub(res, "status").returnsThis();
      sinon.stub(res, "json").returns();
      sinon.stub(res, "setHeader").returns(true);
      sinon
        .stub(XlsxFileManager, "jsonSchemaGenerator")
        .returns(mockJsonSchema);
      const writeFileStub = sinon.stub(fs.promises, "writeFile");
      writeFileStub.onFirstCall().returns(true);
      sinon.stub(latency, "latencyCalculator").returns(true);
      writeFileStub.onSecondCall().returns("mm_files/schema.xsd");
      sinon
        .stub(XlsxFileManager, "parseXSDFile")
        .returns("mm_files/curation.xsd");
      sinon.stub(fs, "createReadStream").returns(mockCurationStream);

      await XlsxController.getCurationXSD(req, res, next);
      sinon.assert.called(mockCurationStream.pipe);
    });

    it('should return xsd in json response if "getXSD" query params is passed', async () => {
      req.query = { isJson: false, isFile: false, getXSD: true };
      sinon.stub(res, "status").returnsThis();
      sinon.stub(res, "json").returns({ xsd: "asdopasjf" });
      sinon
        .stub(XlsxFileManager, "jsonSchemaGenerator")
        .returns(mockJsonSchema);
      const writeFileStub = sinon.stub(fs.promises, "writeFile");
      writeFileStub.onFirstCall().returns(true);
      sinon.stub(latency, "latencyCalculator").returns(true);
      writeFileStub.onSecondCall().returns("mm_files/schema.xsd");
      sinon
        .stub(XlsxFileManager, "parseXSDFile")
        .returns("mm_files/curation.xsd");
      sinon.stub(fs.promises, "readFile").returns({ xsd: "asdopasjf" });
      const result = await XlsxController.getCurationXSD(req, res, next);
      expect(result).to.be.an("Object");
      expect(result).to.have.property("xsd");
    });

    it("should return a 500 server error when database throws an error", async function () {
      req.query = { isJson: false, isFile: true };
      const nextSpy = sinon.spy();
      sinon.stub(res, "status").returnsThis();
      sinon.stub(res, "json").returnsThis();
      sinon.stub(XlsxFileManager, "jsonSchemaGenerator").throws();

      await XlsxController.getCurationXSD(req, res, nextSpy);
      sinon.assert.called(nextSpy);
    });
  });

  context("Update Curations", () => {
    it("should return 404 not found error if ID is invalid and isNew curation", async () => {
      req.body = { payload: mockCuratedXlsxObject };
      req.query = { xlsxObjectId: "a90w49a40ao4094k4aed", isNew: "true" };
      sinon
        .stub(XlsxObject, "findOne")
        .returns({
          lean: sinon.stub().returnsThis(),
          populate: sinon.stub().returns(null),
        });
      const result = await XlsxController.updateXlsxCurations(req, res, next);
      expect(result).to.have.property("message");
      expect(result.message).to.equal(
        `Curated sample ID: ${req.query.xlsxObjectId} not found`
      );
    });

    it("should return 404 not found error if ID is invalid and it is old curation", async () => {
      req.body = { payload: mockCuratedXlsxObject };
      req.query = { xlsxObjectId: "a90w49a40ao4094k4aed", isNew: "false" };
      sinon.stub(XmlData, "findOne").returns(null);
      const result = await XlsxController.updateXlsxCurations(req, res, next);
      expect(result).to.have.property("message");
      expect(result.message).to.equal(
        `Curated sample ID: ${req.query.xlsxObjectId} not found`
      );
    });

    it("should update curation object with submitted payload when it is old curation", async () => {
      req.body = { payload: updatedCuratedXlsxObject };
      req.query = { xlsxObjectId: "a90w49a40ao4094k4aed", isNew: "false" };
      sinon.stub(res, "status").returnsThis();
      sinon.stub(res, "json").returns(fetchedCuratedXlsxObject);
      sinon.stub(XmlData, "findOne").returns(mockXmlData);
      sinon.stub(XmlData, "findOneAndUpdate").returns(fetchedCuratedXlsxObject);
      sinon.stub(latency, "latencyCalculator").returns(true);

      const result = await XlsxController.updateXlsxCurations(req, res, next);

      expect(result).to.be.an("Object");
      expect(result).to.have.property("object");
      expect(result).to.have.property("user");
    });

    it('Should return a message "No changes" if no changes occurred with submitted payload', async () => {
      req.body = { payload: mockBaseObject };
      req.query = { xlsxObjectId: "a90w49a40ao4094k4aed", isNew: "true" };
      sinon.stub(res, "status").returnsThis();
      sinon.stub(res, "json").returns({ message: "No changes" });
      sinon.stub(util, "isDeepStrictEqual").returns(true);
      sinon.stub(XlsxObject, "findOne").returns(fetchedCuratedXlsxObject);

      const result = await XlsxController.updateXlsxCurations(req, res, next);

      expect(result).to.have.property("message");
      expect(result.message).to.equal("No changes");
    });

    it("should update curation object with submitted payload", async () => {
      req.body = { payload: updatedCuratedXlsxObject };
      req.query = { xlsxObjectId: "a90w49a40ao4094k4aed", isNew: "true" };
      sinon.stub(res, "status").returnsThis();
      sinon.stub(res, "json").returns(fetchedCuratedXlsxObject);
      sinon.stub(XlsxObject, "findOne").returns(fetchedCuratedXlsxObject);
      sinon
        .stub(XlsxObject, "findOneAndUpdate")
        .returns(fetchedCuratedXlsxObject);
      sinon.stub(latency, "latencyCalculator").returns(true);

      const result = await XlsxController.updateXlsxCurations(req, res, next);

      expect(result).to.be.an("Object");
      expect(result).to.have.property("object");
      expect(result).to.have.property("user");
    });

    it("should update curation object with submitted payload", async () => {
      req.body = { payload: mockJsonObject.curatedjsonObject };
      req.query = {
        xlsxObjectId: "a90w49a40ao4094k4aed",
        isNew: "true",
        isBaseUpdate: "true",
      };
      sinon.stub(res, "status").returnsThis();
      sinon.stub(res, "json").returns(fetchedCuratedXlsxObject);
      sinon.stub(XlsxObject, "findOne").returns(fetchedCuratedXlsxObject);
      sinon.stub(FileController, "fileContent").returns(mockCurationStream);
      sinon.stub(XlsxFileManager, "parseCSV").returns(mockCSVData);
      sinon
        .stub(XlsxObject, "findOneAndUpdate")
        .returns(fetchedCuratedXlsxObject);
      sinon.stub(latency, "latencyCalculator").returns(true);

      const result = await XlsxController.updateXlsxCurations(req, res, next);

      expect(result).to.be.an("Object");
      expect(result).to.have.property("object");
      expect(result).to.have.property("user");
    });

    it("should return error when jsonOBject has error fields", async function () {
      req.body = { payload: mockJsonObjectErrored.curatedjsonObject };
      req.query = {
        xlsxObjectId: "a90w49a40ao4094k4aed",
        isNew: "false",
        isBaseUpdate: "true",
      };
      sinon.stub(res, "status").returnsThis();
      sinon.stub(res, "json").returns(mockjsonError);
      sinon.stub(XmlData, "findOne").returns(mockXmlData);
      sinon.stub(latency, "latencyCalculator").returns(true);

      const result = await XlsxController.updateXlsxCurations(req, res, next);
      expect(result).to.have.property("fieldError");
    });

    it("should return a 500 server error when database throws an error", async function () {
      req.body = { payload: mockCuratedXlsxObject };
      req.query = { xlsxObjectId: "a90w49a40ao4094k4aed", isNew: 'true' };
      const nextSpy = sinon.spy();
      sinon.stub(res, "status").returnsThis();
      sinon.stub(res, "json").returnsThis();
      sinon.stub(XlsxObject, "findOne").throws();

      await XlsxController.updateXlsxCurations(req, res, nextSpy);
      sinon.assert.calledOnce(nextSpy);
    });
  });

  context("Delete curations", () => {
    it("should return 404 not found error if req.query ID is invalid", async () => {
      req.query = { xlsxObjectId: "a90w49a40ao4094k4aed" };
      sinon.stub(XlsxObject, "findOneAndDelete").returns(null);
      const result = await XlsxController.deleteXlsxCurations(req, res, next);
      expect(result).to.have.property("message");
      expect(result.message).to.equal("Curation sample not found");
    });

    it("should return 404 not found error if req.query ID is invalid", async () => {
      req.query = { dataset: "a90w49a40ao4094k4aed" };
      sinon.stub(DatasetId, "findOneAndDelete").returns(null);
      const result = await XlsxController.deleteXlsxCurations(req, res, next);
      expect(result).to.have.property("message");
      expect(result.message).to.equal(
        `Dataset ID: ${req.query.dataset} not found`
      );
    });

    it("deletes a curation  when a valid req.query curation ID is provided", async () => {
      req.query = { xlsxObjectId: "a90w49a40ao4094k4aed" };
      sinon.stub(res, "status").returnsThis();
      sinon
        .stub(res, "json")
        .returns({
          message: `Curated sample ID: ${req.query.xlsxObjectId} successfully deleted`,
        });
      sinon
        .stub(XlsxObject, "findOneAndDelete")
        .returns(fetchedCuratedXlsxObject);
      sinon.stub(DatasetId, "findOneAndUpdate").returns(mockDatasetId);
      const result = await XlsxController.deleteXlsxCurations(req, res, next);

      expect(result).to.be.an("Object");
      expect(result).to.have.property("message");
      expect(result.message).to.equal(
        `Curated sample ID: ${req.query.xlsxObjectId} successfully deleted`
      );
    });

    it("deletes multiple curated objects and datasetID when a valid dataset ID query is provided", async () => {
      req.query = { dataset: "a90w49a40ao4094k4aed" };
      sinon.stub(res, "status").returnsThis();
      sinon
        .stub(res, "json")
        .returns({
          message: `Curated Samples with Dataset ID: ${req.query.dataset} successfully deleted`,
        });
      sinon.stub(DatasetId, "findOneAndDelete").returns(mockDatasetId);
      sinon.stub(XlsxObject, "deleteMany").returns(true);
      const result = await XlsxController.deleteXlsxCurations(req, res, next);

      expect(result).to.be.an("Object");
      expect(result).to.have.property("message");
      expect(result.message).to.equal(
        `Curated Samples with Dataset ID: ${req.query.dataset} successfully deleted`
      );
    });

    it("should return a 500 server error when database throws an error", async function () {
      req.query = { xlsxObjectId: "a90w49a40ao4094k4aed" };
      const nextSpy = sinon.spy();
      sinon.stub(res, "status").returnsThis();
      sinon.stub(res, "json").returnsThis();
      sinon.stub(XlsxObject, "findOneAndDelete").throws();

      await XlsxController.deleteXlsxCurations(req, res, nextSpy);
      sinon.assert.calledOnce(nextSpy);
    });
  });

  context("createMaterialObject", () => {
    it("should return error object", async () => {
      sinon.stub(XlsxFileManager, "xlsxFileReader").returns(mockSheetData);
      const error = await createMaterialObject(
        correctXlsxFile[0].path,
        mockJsonStructure,
        mockCurationListMap,
      );

      expect(error).to.be.an("Object");
      expect(error).to.have.property("errorCount");
      expect(error).to.have.property("errors");
    });
    it("should return parsed and filtered xlsx object 1", async () => {
      sinon.stub(XlsxFileManager, "xlsxFileReader").returns(mockSheetData2);
      const result = await XlsxController.createMaterialObject(
        correctXlsxFile[0].path,
        mockJsonStructure,
        mockCurationListMap
      );

      expect(result).to.be.an("Object");
      expect(result).to.have.property("Your Name");
    });
    
    it("should return parsed and filtered xlsx object for varied_multiple types", async () => {
      sinon.stub(XlsxFileManager, "xlsxFileReader").returns(mockSheetData5);
      const result = await XlsxController.createMaterialObject(
        correctXlsxFile[0].path,
        mockJsonStructure5,
        mockCurationListMap
      );

      expect(result).to.be.an("Object");
      expect(result).to.have.property("MeltMixing");
    });

    it("should return parsed and filtered xlsx object 2", async () => {
      sinon.stub(XlsxFileManager, "xlsxFileReader").returns(mockSheetData3);
      sinon.stub(XlsxFileManager, "parseCSV").returns(mockCSVData);
      sinon.stub(FileStorage, 'minioPutObject').returns(true);
      const result = await XlsxController.createMaterialObject(
        correctXlsxFile[0].path,
        mockJsonStructure2,
        mockCurationListMap,
        mockUploadedFiles,
        { toBeUploaded: [], toBeDeleted: [] }
      );
      expect(result).to.be.an("Object");
      expect(result).to.have.property("DMA Datafile");
      expect(result["DMA Datafile"]).to.be.an("Array");
    });

    it("should return parsed and filtered xlsx object 3 handling default", async () => {
      sinon.stub(XlsxFileManager, "xlsxFileReader").returns(mockSheetData4);
      sinon.stub(FileStorage, 'minioPutObject').returns(true);
      const result = await XlsxController.createMaterialObject(
        correctXlsxFile[0].path,
        mockJsonStructure4,
        mockCurationListMap,
        mockUploadedFiles,
        { toBeUploaded: [], toBeDeleted: [] },
        [],
        { info: sinon.spy() },
        true
      );

      expect(result).to.be.an("Object");
      expect(result).to.have.property("Microstructure");
      expect(result.Microstructure).to.have.property("Imagefile");
      expect(result.Microstructure.Imagefile).to.be.an("Array");
    });

    it("should return error when file is not uploaded", async () => {
      sinon.stub(XlsxFileManager, "xlsxFileReader").returns(mockSheetData3);
      sinon.stub(FileStorage, 'minioPutObject').returns(true);
      const error = await XlsxController.createMaterialObject(
        correctXlsxFile[0].path,
        mockJsonStructure2,
        mockCurationListMap,
        correctXlsxFile
      );

      expect(error).to.be.an("Object");
      expect(error).to.have.property("errorCount");
      expect(error).to.have.property("errors");
    });
  });

  context("Get curation base schema object", () => {
    it("should return a partial json structure when query param is present", async () => {
      req.query = { sheetName: "Data Origin" };
      sinon.stub(res, "status").returnsThis();
      sinon.stub(res, "json").returns(mockJsonStructure);

      const result = await XlsxController.getCurationSchemaObject(
        req,
        res,
        next
      );

      expect(result).to.be.an("Object");
      expect(result).to.have.property("Your Name");
    });

    it("Returns the whole base schema object structure if no query param is provided", async () => {
      req.query = { sheetName: "" };
      sinon.stub(res, "status").returnsThis();
      sinon.stub(res, "json").returns(mockJsonStructure2);

      const result = await XlsxController.getCurationSchemaObject(
        req,
        res,
        next
      );

      expect(result).to.be.an("Object");
      expect(result).to.have.property("DMA Datafile");
    });

    it("Returns list of valid sheetnames", async () => {
      req.query = { getSheetNames: true };
      const mockSheetNames = ["ID", "Control_ID"];
      sinon.stub(res, "status").returnsThis();
      sinon.stub(res, "json").returns(mockSheetNames);

      const result = await XlsxController.getCurationSchemaObject(
        req,
        res,
        next
      );

      expect(result).to.be.an("Array");
      expect(result.includes("ID")).to.equal(true);
      expect(result.includes("Control_ID")).to.equal(true);
    });
  });
});
