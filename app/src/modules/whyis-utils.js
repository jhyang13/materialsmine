import { querySparql } from './sparql'

// const lodPrefix = 'https://purl.org/whyis/local'
const lodPrefix = 'http://nanomine.org'

const getAboutUrl = (uri) => `about?uri=${uri}`

const deleteNanopub = async (uri) => {
  return await querySparql('', {
    method: 'DELETE',
    whyisPath: getAboutUrl(uri)
  })
}

function makeNanopubId () {
  // Math.random should be unique because of its seeding algorithm.
  // Convert it to base 36 (numbers + letters), and grab the first 9 characters
  // after the decimal.
  return Math.random().toString(36).substr(2, 10)
}

async function listNanopubs (uri) {
  const response = await querySparql('', { whyisPath: `about?view=nanopublications&uri=${encodeURIComponent(uri)}` })
  return response.data
}

const postNewNanopub = async (pubData, context) => {
  const nanopub = getNanopubSkeleton()
  if (context) {
    nanopub['@context'] = { ...nanopub['@context'], ...context }
  }
  nanopub['@graph']['np:hasAssertion']['@graph'].push(pubData)

  return await querySparql('', { body: { ...nanopub }, method: 'POST', whyisPath: 'pub' })
}

function getNanopubSkeleton () {
  // doot
  const npId = `${lodPrefix}/pub/${makeNanopubId()}` // make sure this change doesn't break other things
  return {
    '@context': {
      '@vocab': lodPrefix + '/',
      '@base': lodPrefix + '/',
      np: 'http://www.nanopub.org/nschema#'
    },
    '@id': npId,
    '@graph': {
      '@id': npId,
      '@type': 'np:Nanopublication',
      'np:hasAssertion': {
        '@id': npId + '_assertion',
        '@type': 'np:Assertion',
        '@graph': []
      },
      'np:hasProvenance': {
        '@id': npId + '_provenance',
        '@type': 'np:Provenance',
        '@graph': {
          '@id': npId + '_assertion'
        }
      },
      'np:hasPublicationInfo': {
        '@id': npId + '_pubinfo',
        '@type': 'np:PublicationInfo',
        '@graph': {
          '@id': npId
        }
      }
    }
  }
}

export {
  deleteNanopub,
  postNewNanopub,
  listNanopubs
}
