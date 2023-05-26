const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const datasetIdSchema = new Schema({
  user: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  status: {
    type: String,
    enum: ['APPROVED', 'UNDER_REVIEW', 'WORK_IN_PROGRESS'],
    default: 'WORK_IN_PROGRESS'
  },
  samples: [{
    type: Schema.Types.ObjectId,
    ref: 'CuratedSample'
  }]
}, { timestamps: true });

module.exports = mongoose.model('DatasetId', datasetIdSchema);
