const fs = require('fs');
let c = fs.readFileSync('style.css', 'utf8');

c = c.replace('.vk-module {\\n    position: sticky;\\n    bottom: 0;\\n    z-index: 100;', '.vk-module {');

c = c.replace('.vk-module {', '.vk-module {\n    position: sticky;\n    bottom: 0;\n    z-index: 100;');

c = c.replace('.main-console {\r\n        padding: 10px;\r\n        overflow-x: hidden;\r\n        width: 100%;\r\n    }', '.main-console {\n        padding: 10px;\n        width: 100%;\n    }');

let lastBlock = /@media \\(max-width: 800px\\) \\{[\s\S]*?\\}$/;
c = c.replace(lastBlock, '@media (max-width: 800px) {\n    .rack-channel {\n        flex-direction: row;\n        flex-wrap: wrap;\n        gap: 8px;\n        padding: 8px 10px;\n    }\n    .rc-label {\n        width: 100%;\n        text-align: center;\n        font-size: 13px;\n        margin-bottom: -4px;\n    }\n    .rc-lcd {\n        flex: 1 1 100%;\n        max-width: none;\n    }\n    .rc-controls {\n        flex: 1 1 100%;\n        flex-wrap: wrap;\n        gap: 8px;\n        justify-content: space-between;\n    }\n    .rc-fader-group {\n        flex: 1 1 45%;\n    }\n    .rc-step-group {\n        flex: 1 1 100%;\n        justify-content: center;\n    }\n    .vk-toolbar {\n        flex-wrap: wrap;\n        gap: 12px;\n        justify-content: center;\n    }\n}');

fs.writeFileSync('style.css', c);
