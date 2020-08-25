
export default {
	save(key,value,ttl=-1) {
		if (!key || !value) { return }
		const cache = {
			data: value,
			epxire: ttl <= 0 ? -1 : parseInt(new Date().getTime() / 1000 + ttl)
		}

		localStorage.setItem(key,JSON.stringify(cache))	
	},

	fetch(key) {
		const data = localStorage.getItem(key)
		if (data) {
			try {
				const cache = JSON.parse(data)
				const ttl = cache.ttl || -1;
				if (ttl === -1 || ttl >= (new Date().getTime() / 1000)) {
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
}