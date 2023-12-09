import createWrapper from '../../../jest/script/wrapper'
import { enableAutoDestroy } from '@vue/test-utils'
import ScatterPlot from '@/pages/metamine/visualizationNU/ScatterPlot.vue'

describe('ScatterPlot.vue', () => {
  let wrapper
  beforeEach(() => {
    wrapper = createWrapper(ScatterPlot, {}, false)
  })
  enableAutoDestroy(afterEach)

  it('mount component correctly', () => {
    const layout = wrapper.findComponent('visualizationlayout-stub')
    expect(layout.exists()).toBe(true)
    expect(layout.findComponent('scatter-stub').exists()).toBe(true)
    expect(layout.findAllComponents('dialog-box-stub').length).toBe(2)
    expect(layout.findComponent('structure-stub').exists()).toBe(true)
    expect(layout.findComponent('youngs-stub').exists()).toBe(true)
    expect(layout.findComponent('poisson-stub').exists()).toBe(true)
    expect(layout.findComponent('dataselector-stub').exists()).toBe(true)
    expect(layout.findComponent('rangeselector-stub').exists()).toBe(true)
    expect(layout.findComponent('materialinformation-stub').exists()).toBe(true)
  })

  it('mounts dialog box correctly', () => {
    const layout = wrapper.findComponent('visualizationlayout-stub')
    const dialogContainer = layout.find('.tools-simulation.u--layout-flex.u--layout-flex-justify-sb')
    const dialogBox = dialogContainer.findAllComponents('dialog-box-stub')
    const dialogProps = [
      { minwidth: '60', disableclose: 'true' },
      { minwidth: '60', disableclose: 'true' }
    ]
    expect(dialogContainer.exists()).toBe(true)
    for (let i = 0; i < dialogBox.length; i++) {
      const element = dialogBox.at(i)
      expect(element.attributes('minwidth')).toBe(dialogProps[i].minwidth)
      expect(element.attributes('disableclose')).toBe(dialogProps[i].disableclose)
    }
  })

  it('renders correct number of buttons', () => {
    const layout = wrapper.findComponent('visualizationlayout-stub')
    const btnContainer = layout.find('.tools-simulation.u--layout-flex.u--layout-flex-justify-sb')
    const button = btnContainer.findAll('button')
    const btnProps = [
      { btnClass: 'nuplot-button', btnText: 'Find Nearest Neighbors' },
      { btnClass: 'nuplot-button button-primary', btnText: 'Save Data' },
      { btnClass: 'nuplot-button button-alert', btnText: 'Reset' }
    ]
    expect(btnProps.length).toBe(3)
    for (let i = 0; i < button.length; i++) {
      const element = button.at(i)
      expect(element.attributes('class')).toBe(btnProps[i].btnClass)
      expect(element.text()).toBe(btnProps[i].btnText)
    }
  })
})