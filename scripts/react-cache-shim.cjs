// Fora do Next, react.cache não existe (só no runtime de servidor do React). Para scripts: identidade.
const r = require("react");
if (typeof r.cache !== "function") r.cache = (fn) => fn;
