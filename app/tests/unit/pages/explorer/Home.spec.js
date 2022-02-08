import createWrapper from '../../../jest/script/wrapper'
import { enableAutoDestroy } from '@vue/test-utils'
import ExplorerHome from '@/pages/explorer/Home.vue'

describe('ExplorerHome.vue', () => {
  let wrapper
  beforeEach(() => {
    wrapper = createWrapper(ExplorerHome, {}, false)
  })

  enableAutoDestroy(afterEach)

  it('render search div correctly', () => {
    expect.assertions(4)
    expect(wrapper.find('.section_teams').exists()).toBe(true)
    expect(wrapper.find('.search_box_header').exists()).toBe(true)
    expect(wrapper.find('.form').exists()).toBe(true)
    expect(wrapper.find('.search_box_text').exists()).toBe(true)
  })

  it('render facet div correctly', () => {
    expect.assertions(1)
    expect(wrapper.find('.facet_panel').exists()).toBe(true)
  })

  it('renders page navs correctly', async () => {
    expect.assertions(1)
    await wrapper.setData({
      pageNavLinks: [
        { icon: 'grid', text: 'test' },
        { icon: 'grid', text: 'test2' }
      ]
    })
    const length = wrapper.vm.pageNavLinks.length
    const navLinks = wrapper.findAll('.explorer_page-nav-card')
    expect(navLinks.length).toEqual(length)
  })

  it('renders footer', () => {
    expect.assertions(2)
    expect(wrapper.find('.explorer_page_footer').exists()).toBe(true)
    expect(wrapper.find('.explorer_page_footer-text').exists()).toBe(true)
  })
})
