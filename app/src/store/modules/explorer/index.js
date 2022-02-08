import mutations from './mutations.js'
import actions from './actions.js'
import getters from './getters.js'

export default {
  namespaced: true,
  state () {
    return {
      toggleMenuVisibility: false,
      searchKeyword: '',
      searching: false
    }
  },
  mutations,
  actions,
  getters
}
