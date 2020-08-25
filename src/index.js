import React from 'react'
import { render } from 'react-dom'
import 'es6-promise/auto'
import GitalkComponent from './gitalk'

window.GT_CACHE = {
  comments: {
    enable: true,
    ttl: 600
  },
  userInfo: {
    enable: true,
    ttl: 3600
  },
  issue: {
    enable: true,
    ttl: -1
  }
}

class Gitalk {
  constructor (options = {}) {
    this.options = options
  }

  render (container, callback) {
    let node = null
    container = container || this.options.container

    if (!container) throw new Error(`Container is required: ${container}`)

    if (!(container instanceof HTMLElement)) {
      node = window.document.getElementById(container)
      if (!node) throw new Error(`Container not found, window.document.getElementById: ${container}`)
    } else {
      node = container
    }

    if (!callback) {
      callback = () => {}
    }

    return render(<GitalkComponent options={this.options}/>, node, callback)
  }
}

module.exports = Gitalk
