
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
				const epxire = cache.epxire || -1;
				if (epxire === -1 || epxire >= (new Date().getTime() / 1000)) {
					return cache.data
				}

				//expired
				localStorage.removeItem(key)
			} catch(err) {
				localStorage.removeItem(key)
			}
		}

		return undefined
	},

	removeByPrefix(keyPrefix) {
		const arr = []

		for (let i = 0; i < localStorage.length; i++){
			if (localStorage.key(i).indexOf(keyPrefix) !== -1) {
					arr.push(localStorage.key(i));
			}
		}

		arr.forEach(key => localStorage.removeItem(key))
	}
}