const fs = require('fs');
let c = fs.readFileSync('style.css', 'utf8');

const oldBlock = @media (max-width: 800px) {
    .rack-channel {
        flex-direction: column;
        align-items: stretch;
        gap: 12px;
    }
    .rc-controls {
        flex-wrap: wrap;
    }
    .vk-toolbar {
        flex-wrap: wrap;
        gap: 16px;
    }
};
const newBlock = @media (max-width: 800px) {
    .rack-channel {
        flex-direction: row;
        flex-wrap: wrap;
        gap: 8px;
        padding: 8px 10px;
    }
    .rc-label {
        width: 100%;
        text-align: center;
        font-size: 13px;
        margin-bottom: -4px;
    }
    .rc-lcd {
        flex: 1 1 100%;
        max-width: none;
    }
    .rc-controls {
        flex: 1 1 100%;
        flex-wrap: wrap;
        gap: 8px;
        justify-content: space-between;
    }
    .rc-fader-group {
        flex: 1 1 45%;
    }
    .rc-step-group {
        flex: 1 1 100%;
        justify-content: center;
    }
    .vk-toolbar {
        flex-wrap: wrap;
        gap: 12px;
        justify-content: center;
    }
};

c = c.replace(oldBlock, newBlock);

fs.writeFileSync('style.css', c);
