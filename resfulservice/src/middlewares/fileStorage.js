const path = require('path');
const express = require('express');
const multer = require('multer');
const { uniqueNamesGenerator, adjectives, names, animals } = require('unique-names-generator');

const shortName = uniqueNamesGenerator({
  dictionaries: [adjectives, animals, names],
  length: 3,
  style: 'lowerCase'
});

const fileStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, req.env?.FILES_DIRECTORY ?? 'mm_files');
  },
  filename: (req, file, cb) => {
    cb(null, shortName + '-' + new Date().toISOString() + '-' + file.originalname);
  }
});

const fileFilter = (req, file, cb) => {
  if (
    file.mimetype === 'image/png' ||
    file.mimetype === 'image/jpg' ||
    file.mimetype === 'image/jpeg' ||
    file.mimetype === 'image/tif' ||
    file.mimetype === 'image/tiff' ||
    file.mimetype === 'text/csv' ||
    file.mimetype === 'application/vnd.ms-excel' ||
    file.mimetype === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
    file.mimetype === 'application/zip' ||
    file.mimetype === 'application/x-zip-compressed'
  ) {
    cb(null, true);
  } else {
    cb(new Error('Only .png, .jpg, .jpeg, .tiff, .tif, .csv, .zip, .xls and .xlsx format allowed!'), false);
  }
};

const fileMgr = multer({ storage: fileStorage, fileFilter }).fields([{ name: 'uploadfile', maxCount: 20 }]);

const fileServer = express.static(path.join(__dirname, 'filestore'));

module.exports = {
  fileMgr,
  fileServer
};
