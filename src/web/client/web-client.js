import axios from 'axios'
import { GT_ACCESS_TOKEN } from '../../const'
import cache from '../cache'
import { queryStringify } from '../../util'

const webClient = axios.create({
  baseURL: 'https://api.github.com',
  headers: {
    'Accept': 'application/vnd.github.v3.full+json'
  }
})

function buildCacheKey(conf) {
  const params = Object.assign({},conf.params)
  //remove time from query
  if (params.t) {
    delete params.t
  }

  let key =`${conf.url}?${queryStringify(params)}`
  if (key.includes("http://") || key.includes("https://")) {
    return key
  }

  return conf.baseURL + key
}

webClient.interceptors.request.use(config => {
  const conf = Object.assign({cache: { enable: true }},config)
  const accessToken = localStorage.getItem(GT_ACCESS_TOKEN)
  const headers = conf.headers
  if (headers) {
    if (!headers['Authorization']) {
      if (accessToken) {
        headers['Authorization'] = `token ${accessToken}`
      } else {
        if (window.GT_PROXY) {
          conf.baseURL = window.GT_PROXY
          if (conf.url.startsWith("https://api.github.com")) {
            conf.url = conf.url.replace('https://api.github.com',conf.baseURL)
          }
        }
      }
    }

    if (!headers['Accept']) {
      headers['Accept'] = 'application/vnd.github.v3.full+json'
    }

    if (conf.method.toLocaleLowerCase() === 'get') {
      if (conf.cache.enable) {
        const cacheKey = buildCacheKey(conf)
        const cacheData = cache.fetch(cacheKey)
        if (cacheData) {
          let source = axios.CancelToken.source()
          conf.cancelToken = source.token

          source.cancel({data: cacheData})
          return conf
        }
      }
    }
  }

  return conf;
},err => Promise.reject(err))

webClient.interceptors.response.use(res => {
  const isValidCode = res.status < 200 && res.status >= 300
  if (isValidCode || !res.data) {
      return res
  }

  const data = res.data
  const conf = Object.assign({cache: { enable: true }},res.config)
  if (data && conf.cache.enable) {
    const cacheKey = buildCacheKey(conf)
    cache.save(cacheKey,data,conf.cache.ttl)
  }

  return res
}, err => {
  if (axios.isCancel(err)) {
    // return Promise.resolve(err.message)
    return new Promise(resolve => setTimeout(() => resolve(err.message), 200));
  }

  return Promise.reject(err)
})

export const client = webClient;