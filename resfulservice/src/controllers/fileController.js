const mongoose = require('mongoose');

exports.imageMigration = async (req, res, next) => {
  const { imageType } = req.params;

  try {
    const bucket = new mongoose.mongo.GridFSBucket(mongoose.connection.db, {
      bucketName: 'fs'
    });

    const files = await bucket
      .find({ filename: { $regex: imageType } })
      .limit(10)
      .toArray();

    return res.status(200).json({ images: files });
  } catch (error) {
    return res.status(500).json({ message: 'error with fetching image', statusCode: 500 });
  }
};

exports.fileContent = async (req, res, next) => {
  const { fileId } = req.params;

  const bucket = new mongoose.mongo.GridFSBucket(mongoose.connection.db, {
    bucketName: 'fs'
  });

  try {
    const _id = new mongoose.Types.ObjectId(fileId);
    const downloadStream = bucket.openDownloadStream(_id);
    downloadStream.pipe(res);
  } catch (error) {
    return res.status(500).json({ message: 'error with fetching image', statusCode: 500 });
  }
};

exports.uploadFile = async (req, res, next) => {
  try {
    console.log(req.files.uploadfile);
    req.logger.info('datasetIdUpload Function Entry:');

    return res.status(201).json({ files: req.files.uploadfile });
  } catch (error) {
    console.log(error);
    return res.status(500).json({ message: 'error uploading files', statusCode: 500 });
  }
};

exports.jobsDataFiles = (req, res, next) => {
  // TODO: Serve requested files from mockDB/managedservices folder
  return res.status(200);
};
