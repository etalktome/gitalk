
function fetchData(key) {
	const data = localStorage.getItem(key)
	if (data) {
		try {
			const cache = JSON.parse(data)
			const expire = cache.expire || -1;
			if (expire === -1 || expire >= (new Date().getTime() / 1000)) {
				return cache.data
			}

			//expired
			localStorage.removeItem(key)
		} catch(err) {
			localStorage.removeItem(key)
		}
	}

	return undefined
}

export default {
	save(key,data,ttl=-1,scope=location.pathname) {
    if (!key || !data || Object.keys(data).length <= 0) { return }
	
		key = 'GT_' + key
		const expire = ttl <= 0 ? -1 : parseInt(new Date().getTime() / 1000 + ttl)
		const cache = { data, expire, scope }
		localStorage.setItem(key,JSON.stringify(cache))	
	},

	fetch(key) {
		key = 'GT_' + key
		return fetchData(key)
  },

	removeByPrefix(keyPrefix) {
		const arr = []
		keyPrefix = 'GT_' + keyPrefix
		for (let i = 0; i < localStorage.length; i++){
			if (localStorage.key(i).indexOf(keyPrefix) !== -1) {
					arr.push(localStorage.key(i));
			}
		}

		arr.forEach(key => localStorage.removeItem(key))
  },
  
  clear(scope = location.pathname) {
    const keys = []
    for (let i=0;i<localStorage.length;i++) {
			const key = localStorage.key(i)
			if (!key.startsWith('GT_')) { continue }

			try {
				let cache = JSON.parse(localStorage.getItem(key))
				if (cache) { 
					if (!scope || scope === cache.scope) {
						keys.push(key)
					}
				}
			} catch (err) {
			}
    }

    keys.forEach(k => localStorage.removeItem(k))
  }
}
