// Wraps the Vercel-style api handlers in a plain node http server for testing.
const http = require("http");
const URL = require("url");
function wrap(handler){
  return http.createServer(async (req, res) => {
    const u = URL.parse(req.url, true);
    req.query = u.query;
    // Vercel exposes query params directly on req.query; body read via stream.
    try { await handler(req, res); }
    catch (e) { res.statusCode = 500; res.setHeader("Content-Type","application/json"); res.end(JSON.stringify({ error: e.message })); }
  });
}
module.exports = { wrap };
