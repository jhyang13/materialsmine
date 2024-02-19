const axios = require('axios');
const { Client } = require('@elastic/elasticsearch');
const configPayload = require('../../config/esConfig');
const env = process.env;

class ElasticSearch {
  constructor () {
    this.client = new Client({ node: `http://${env?.ESADDRESS}` });
    this.initES = this.initES.bind(this);
    this.search = this.search.bind(this);
  }

  /**
   * Check if ES is up & running
   * @returns {Boolean} ping
   */
  async ping (log, waitTime = 50000) {
    log.info('elasticsearch.ping(): Function entry');
    try {
      return new Promise((resolve, reject) => {
        const timer = setTimeout(async () => {
          const response = await this.client.ping();
          clearTimeout(timer);
          if (!response) {
            const error = new Error('Elastic Search Service Not Available');
            log.error(`elasticsearch.ping(): 500 - ${error}`);
            reject(error);
          }
          log.debug(`elasticsearch.ping(): response ${response}`);
          resolve(response);
        }, waitTime);
      });
    } catch (err) {
      log.error(`elasticsearch.ping(): ${err.status || 500} - ${err}`);
      throw err;
    }
  }

  /**
   *
   * @param {String} type
   * @returns {Object} response
   */
  async _createConfig (type, log) {
    log.info('elasticsearch._createConfig(): Function entry');
    try {
      const configResponse = await axios({
        method: 'put',
        url: `http://${env.ESADDRESS}/${type}`,
        headers: {
          'Content-Type': 'application/json'
        },
        data: JSON.stringify({ ...configPayload.config })
      });
      return configResponse;
    } catch (err) {
      log.error(`elasticsearch._createConfig(): ${err.status || 500} - ${err}`);
      throw err;
    }
  }

  /**
   * Deletes all documents of an index
   * @param {Object} req
   * @param {String} type
   * @returns response
   */
  async deleteIndexDocs (req, type) {
    const log = req.logger;
    log.info('elasticsearch.deleteIndexDocs(): Function entry');
    try {
      return this.client.deleteByQuery({
        index: type,
        body: {
          query: {
            match_all: {}
          }
        },
        timeout: '5m' // Todo: Increase when data becomes larger
      });
    } catch (err) {
      log.error(
        `elasticsearch.deleteIndexDocs(): ${err.status || 500} - ${err}`
      );
      throw err;
    }
  }

  async deleteSingleDoc (req, type, identifier) {
    const log = req.logger;
    log.info('elasticsearch.deleteSingleDoc(): Function entry');
    try {
      return this.client.deleteByQuery({
        index: type,
        body: {
          query: {
            match_phrase: {
              identifier
            }
          }
        }
      });
    } catch (err) {
      log.error(
        `elasticsearch.deleteSingleDoc(): ${err.status || 500} - ${err}`
      );
      throw err;
    }
  }

  async _putMappings (type, schema, log) {
    log.info('elasticsearch._putMappings(): Function entry');
    try {
      return await this.client.indices.putMapping({
        index: type,
        // type: 'articles',
        body: {
          ...schema
        }
      });
    } catch (err) {
      log.error(`elasticsearch._putMappings(): ${err.status || 500} - ${err}`);
      throw err;
    }
  }

  async _getExistingIndices (log) {
    log.info('elasticsearch._getExistingIndices(): Function entry');
    try {
      return await this.client.cat.indices({ format: 'json' });
    } catch (err) {
      log.error(
        `elasticsearch._getExistingIndices(): ${err.status || 500} - ${err}`
      );
      throw err;
    }
  }

  async initES (req) {
    const log = req.logger;
    log.info('elasticsearch.initES(): Function entry');
    try {
      // Check and ignore existing indexes before create
      const existingIndexes = await this._getExistingIndices(log);

      // Remove elastic search index config from list of keys
      const preparedKeys = Object.keys(configPayload)?.filter(
        (e) => e !== 'config'
      );

      // Create a set of existing indices
      const existingIndicesSet = new Set(
        existingIndexes.map((index) => index.index)
      );
      const nonExistingKeys = [];
      // Check if all indices in indices exist in existingIndicesSet
      const allIndicesExist = preparedKeys.every((index) => {
        const exists = existingIndicesSet.has(index);
        if (!exists) nonExistingKeys.push(index);
        return exists;
      });

      if (allIndicesExist) {
        log.info('elasticsearch.initES(): All indexes exist in Elastic search');
        return;
      }

      if (nonExistingKeys.length) {
        log.info(
          `elasticsearch.initES(): Adding the following missing index(es) ${nonExistingKeys.join(
            ','
          )}`
        );
      }

      Object.entries(configPayload).forEach(async ([key, value]) => {
        if (nonExistingKeys.includes(key)) {
          try {
            await this._createConfig(key, log);
            await this._putMappings(key, value, log);
          } catch (error) {
            log.error(
              `elasticsearch.initES(): ${error.status || 500} - ${error}`
            );
          }
        }
      });

      return {
        status: 'Successfully configured schemas!'
      };
    } catch (err) {
      log.error(`elasticsearch.initES(): ${err.status || 500} - ${err}`);
      throw err;
    }
  }

  async indexDocument (req, type, doc) {
    const log = req.logger;
    log.info('elasticsearch.indexDocument(): Function entry');
    if (!type || !doc) {
      const error = new Error('Category type is missing');
      error.statusCode = 400;
      log.error(`indexDocument(): ${error}`);
      throw error;
    }
    try {
      return this.client.index({
        index: type,
        refresh: true,
        document: { ...doc }
      });
    } catch (err) {
      log.error(`elasticsearch.indexDocument(): ${err.status || 500} - ${err}`);
      throw err;
    }
  }

  async refreshIndices (req, type) {
    const log = req.logger;
    log.info('elasticsearch.refreshIndices(): Function entry');
    if (!type) {
      const error = new Error('Category type is missing');
      error.statusCode = 400;
      log.error(`refreshIndices(): ${error}`);
      throw error;
    }
    try {
      return this.client.indices.refresh({ index: type });
    } catch (err) {
      log.error(
        `elasticsearch.refreshIndices(): ${err.status || 500} - ${err}`
      );
      throw err;
    }
  }

  searchSanitizer (search) {
    let sanitizeSearch = search;
    sanitizeSearch = sanitizeSearch
      .split(' ')
      // eslint-disable-next-line array-callback-return
      .map((word, index) => {
        // eslint-disable-line
        if (index < 20) {
          if (word.length > 50) {
            return word.substr(0, 75);
          }
          return word;
        }
      })
      .join(' ');

    // if (sanitizeSearch.match(/"|\*|\s|\/|:|\./)) {
    if (sanitizeSearch.match(/"|\*|\/|:|\./)) {
      sanitizeSearch = `${sanitizeSearch}\\*`;
    }
    return sanitizeSearch;
  }

  async searchType (req, searchPhrase, searchField, type, page = 1, size = 20) {
    const log = req.logger;
    log.info('elasticsearch.searchType(): Function entry');

    try {
      // TODO: use searchField to change which field is queried
      const phrase = this.searchSanitizer(searchPhrase);
      const url = `http://${env.ESADDRESS}/${type}/_search?size=${size}`;
      const response = await axios({
        method: 'get',
        url,
        headers: {
          'Content-Type': 'application/json'
        },
        data: JSON.stringify({
          from: (page - 1) * size,
          query: {
            bool: {
              should: [
                {
                  match_phrase: {
                    label: phrase
                  }
                },
                {
                  match_phrase: {
                    description: phrase
                  }
                }
              ]
            }
          }
        })
      });
      return response;
    } catch (err) {
      log.error(`elasticsearch.searchType(): ${err.status || 500} - ${err}`);
      throw err;
    }
  }

  async search (req, searchPhrase, autosuggest = false) {
    const log = req.logger;
    log.info('elasticsearch.search(): Function entry');
    try {
      const phrase = this.searchSanitizer(searchPhrase);
      let url = `http://${env.ESADDRESS}/_all/_search?size=400`;

      if (autosuggest) {
        url = `http://${env.ESADDRESS}/_all/_search?size=100&pretty=true`;
      }
      return axios({
        method: 'get',
        url,
        headers: {
          'Content-Type': 'application/json'
        },
        data: JSON.stringify({
          query: {
            bool: {
              should: [
                {
                  match: {
                    label: phrase
                  }
                },
                {
                  match: {
                    description: phrase
                  }
                }
              ]
            }
          }
        })
      });
    } catch (err) {
      log.error(`elasticsearch.search(): ${err.status || 500} - ${err}`);
      throw err;
    }
  }

  async loadAllCharts (req, page, size) {
    const log = req.logger;
    log.info('elasticsearch.loadAllCharts(): Function entry');
    try {
      const url = `http://${env.ESADDRESS}/charts/_search`;
      return axios({
        method: 'get',
        url,
        headers: {
          'Content-Type': 'application/json'
        },
        data: JSON.stringify({
          from: (page - 1) * size,
          size,
          query: {
            match_all: {}
          }
        })
      });
    } catch (err) {
      log.error(`elasticsearch.loadAllCharts(): ${err.status || 500} - ${err}`);
      throw err;
    }
  }

  async loadAllDatasets (req, page, size) {
    const log = req.logger;
    log.info('elasticsearch.loadAllDatasets(): Function entry');
    const url = `http://${env.ESADDRESS}/datasets/_search`;
    try {
      return axios({
        method: 'get',
        url,
        headers: {
          'Content-Type': 'application/json'
        },
        data: JSON.stringify({
          from: (page - 1) * size,
          size,
          query: {
            match_all: {}
          }
        })
      });
    } catch (err) {
      log.error(
        `elasticsearch.loadAllDatasets(): ${err.status || 500} - ${err}`
      );
      throw err;
    }
  }

  async searchKnowledgeGraph (req, searchPhrase) {
    const log = req.logger;
    log.info('elasticsearch.searchKnowledgeGraph(): Function entry');
    // search knowledge index for key
    try {
      const result = await this.client.search({
        index: 'knowledge',
        body: {
          query: {
            match_phrase: {
              label: searchPhrase
            }
          }
        }
      });
      return result.hits.hits;
    } catch (err) {
      log.error(
        `elasticsearch.searchKnowledgeGraph(): ${err.status || 500} - ${err}`
      );
      throw err;
    }
  }

  async createKnowledgeGraphDoc (log, _id, label, result) {
    log.info('elasticsearch.createKnowledgeGraphDoc(): Function entry');
    // create new doc under knowledge index
    const url = `http://${env.ESADDRESS}/knowledge/_update/${_id}`;
    try {
      return await axios({
        method: 'post',
        url,
        headers: {
          'Content-Type': 'application/json'
        },
        data: JSON.stringify({
          doc: {
            label,
            response: result,
            date: new Date().toISOString().slice(0, 10)
          },
          doc_as_upsert: true
        })
      });
    } catch (err) {
      log.error(
        `elasticsearch.createKnowledgeGraphDoc(): ${err.status || 500} - ${err}`
      );
      throw err;
    }
  }
}

module.exports = new ElasticSearch();
