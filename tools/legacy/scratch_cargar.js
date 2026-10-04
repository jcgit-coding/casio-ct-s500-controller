const fs = require('fs');
let appJs = fs.readFileSync('app.js', 'utf8');
appJs = appJs.replace(/'Cargar'/g, "'Load'");
appJs = appJs.replace(/Cargar preset/g, "Load preset");
fs.writeFileSync('app.js', appJs);
