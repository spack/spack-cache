// This worker finds unique package attribute values in the background

onmessage = (e) => {
    const [packageData, specData] = e.data;
    const uniqueValues = {}

    for (const pName in packageData) {
        const specHashes = Object.values(packageData[pName].specs).flat();
        for (const hash of specHashes) {
            const spec = specData[hash];
            for (const key in spec) {
                if (key == 'hash' || key == 'dependencies') continue;
                let values = spec[key];
                if (Array.isArray(values)) values = values.map((v) => v.label ? v.label : v);
                else values = [values];
                for (val of values) {
                    if (!uniqueValues[key]) uniqueValues[key] = {};
                    if (!uniqueValues[key][val]) uniqueValues[key][val] = {};
                    if (!uniqueValues[key][val][pName]) uniqueValues[key][val][pName] = [];
                    uniqueValues[key][val][pName].push(hash);
                }
            }
        }
    }
    postMessage(uniqueValues);
}