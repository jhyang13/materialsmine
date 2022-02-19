import { querySparql, parseSPARQL } from '@/modules/sparql'
import sampleQueries from '@/modules/queries/sampleQueries'
import Spinner from '@/components/Spinner'

export default {
  name: 'SampleView',
  components: {
    Spinner
  },
  data () {
    return {
      header: null,
      materialComponents: null,
      curatedProperties: null,
      processLabel: null,
      processingSteps: null,
      sampleImages: null,
      otherSamples: null,
      loading: false
    }
  },
  methods: {
    async fetchData (query) {
      const sampleId = this.$route.params.label
      return await querySparql(query(sampleId))
    },
    parseHeader (data) {
      if (!data || data.length === 0) return null
      const parsedData = parseSPARQL(data)
      const [sampleData] = parsedData
      return sampleData
    },
    parseOtherSamples (data) {
      if (!data || data.length === 0) return null
      const parsedData = parseSPARQL(data)
      const links = parsedData.map(({ sample }) => sample.split('/').pop())
      return links
    },
    parseProcessLabel (data) {
      if (!data || data.length === 0) return null
      const parsedData = parseSPARQL(data)
      const [processLabelObject] = parsedData
      const { process_label: processLabel } = processLabelObject
      return processLabel
    },
    parseMaterialData (data) {
      if (!data || data.length === 0) return null
      const parsedData = parseSPARQL(data)
      const seen = new Set()
      const filteredArr = parsedData
        .filter((item) => {
          const duplicate = seen.has(item.std_name)
          seen.add(item.std_name)
          return !duplicate
        })
        .map((item) => {
          return {
            class: item.std_name,
            role: item.role
          }
        })

      filteredArr.forEach((element) => {
        const materialProperties = parsedData
          .filter((item) => item.std_name === element.class)
          .map((item) => {
            const { attrUnits, attrValue: value, attrType } = item
            const units = attrUnits || ''
            const type = attrType
              .split('/')
              .pop()
              .match(/[A-Z][a-z]+|[0-9]+/g)
              .join(' ')
            return {
              type,
              units,
              value
            }
          })
        element.materialProperties = materialProperties
      })
      return filteredArr
    },
    parseCuratedProperties (data) {
      if (!data || data.length === 0) return null
      const parseData = parseSPARQL(data)
      if (!parseData.length) return null
      const curatedProperties = parseData.map((property) => {
        const { AttrType, value, Units: units } = property
        const type = AttrType.split('/')
          .pop()
          .match(/[A-Z][a-z]+|[0-9]+/g)
          .join(' ')
        return {
          type,
          units,
          value
        }
      })
      return curatedProperties
    },
    parseProcessingSteps (data) {
      if (!data || data.length === 0) return null
      const parsedData = parseSPARQL(data)
      const steps = parsedData.map(
        ({ param_label: parameterLabel, Descr: description }) => {
          return { parameterLabel, description }
        }
      )
      return steps
    },
    parseSampleImages (data) {
      if (!data || data.length === 0) return null
      const parsedData = parseSPARQL(data)
      const images = parsedData.map((item) => {
        return { src: item.image, alt: item.sample }
      })
      return images
    },
    async fetchSamplePageData () {
      this.loading = true
      await Promise.allSettled([
        this.fetchData(sampleQueries.materialComponents),
        this.fetchData(sampleQueries.curatedProperties),
        this.fetchData(sampleQueries.processLabel),
        this.fetchData(sampleQueries.processingSteps),
        this.fetchData(sampleQueries.sampleImages),
        this.fetchData(sampleQueries.otherSamples),
        this.fetchData(sampleQueries.header)
      ])
        .then((res) => {
          const data = res.map((promise) => {
            if (promise.status === 'fulfilled') return promise.value
            console.error(promise.reason)
            return null
          })
          const [
            materialComponents,
            curatedProperties,
            processLabel,
            processingSteps,
            sampleImages,
            otherSamples,
            header
          ] = data
          this.materialComponents = this.parseMaterialData(materialComponents)
          this.curatedProperties =
            this.parseCuratedProperties(curatedProperties)
          this.processLabel = this.parseProcessLabel(processLabel)
          this.processingSteps = this.parseProcessingSteps(processingSteps)
          this.sampleImages = this.parseSampleImages(sampleImages)
          this.otherSamples = this.parseOtherSamples(otherSamples)
          this.header = this.parseHeader(header)
          this.loading = false
        })
        .catch((e) => console.error(e))
    }
  },

  watch: {
    $route: 'fetchSamplePageData'
  },
  created () {
    this.fetchSamplePageData()
  }
}
