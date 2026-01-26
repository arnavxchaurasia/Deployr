const express = require('express');
const httpProxy = require('http-proxy');
const axios = require('axios');

const app = express();
const PORT = 8000;

const BASE_PATH = 'https://vercel-clone-ws.s3.us-east-1.amazonaws.com/__outputs';
const API_SERVER = 'http://localhost:9000'; // or deployed URL

const proxy = httpProxy.createProxy();

app.use(async (req, res) => {
  const hostname = req.hostname;
  const subdomain = hostname.split('.')[0];

  try {
    const response = await axios.get(`${API_SERVER}/resolve/${subdomain}`);
    const projectId = response.data.projectId;

    const resolvesTo = `${BASE_PATH}/${projectId}`;
    return proxy.web(req, res, { target: resolvesTo, changeOrigin: true });

  } catch (err) {
    return res.status(404).send('Project not found');
  }
});

proxy.on('proxyReq', (proxyReq, req, res) => {
  if (req.url === '/') {
    proxyReq.path += 'index.html';
  }
});

app.listen(PORT, () => console.log(`Reverse Proxy running on ${PORT}`));
