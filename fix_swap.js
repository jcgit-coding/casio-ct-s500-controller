document.addEventListener('DOMContentLoaded', () => {
    const swapBtns = document.querySelectorAll('.btn-swap');
    
    // Almacenar el nombre original (con el spam dim opcional) basado en su order
    const titlesByOrder = {
        '1': 'INSTRUMENTO 1',
        '2': 'INSTRUMENTO 2',
        '3': 'INSTRUMENTO 3'
    };

    swapBtns.forEach(btn => {
        btn.addEventListener('click', (e) => {
            const targetPart = btn.getAttribute('data-target'); // e.g., 'U2'
            const currentPart = btn.closest('.track-card').getAttribute('data-part'); // e.g., 'U1'
            
            if (targetPart === currentPart) return;

            const cardCurrent = document.getElementById(`card-${currentPart}`);
            const cardTarget = document.getElementById(`card-${targetPart}`);

            if (cardCurrent && cardTarget) {
                // 1. Save the CURRENT visual state of both cards BEFORE swapping
                const searchCurr = cardCurrent.querySelector('.search-input');
                const listCurr = cardCurrent.querySelector('.tone-list');
                const searchTarg = cardTarget.querySelector('.search-input');
                const listTarg = cardTarget.querySelector('.tone-list');

                const valCurr = searchCurr.value;
                const valTarg = searchTarg.value;
                const selCurr = listCurr.selectedIndex >= 0 ? listCurr.options[listCurr.selectedIndex].value : null;
                const selTarg = listTarg.selectedIndex >= 0 ? listTarg.options[listTarg.selectedIndex].value : null;

                // 2. Swap the flex order (this moves the DOM elements, changing their routing)
                const currentOrder = cardCurrent.style.order || getComputedStyle(cardCurrent).order;
                const targetOrder = cardTarget.style.order || getComputedStyle(cardTarget).order;

                cardCurrent.style.order = targetOrder;
                cardTarget.style.order = currentOrder;
                
                // 3. Swap the column titles so "Instrumento X" stays physically fixed
                const titleCurrent = cardCurrent.querySelector('.inst-title');
                const titleTarget = cardTarget.querySelector('.inst-title');
                
                if (titleCurrent && titlesByOrder[targetOrder]) {
                    titleCurrent.innerHTML = titlesByOrder[targetOrder];
                }
                if (titleTarget && titlesByOrder[currentOrder]) {
                    titleTarget.innerHTML = titlesByOrder[currentOrder];
                }

                // 4. RESTORE the visual instrument state so it looks like the instrument didn't move
                searchCurr.value = valTarg;
                searchTarg.value = valCurr;
                searchCurr.dispatchEvent(new Event('input'));
                searchTarg.dispatchEvent(new Event('input'));

                if (selTarg) {
                    Array.from(listCurr.options).forEach((opt, i) => { if (opt.value === selTarg) listCurr.selectedIndex = i; });
                    listCurr.dispatchEvent(new Event('change'));
                }
                if (selCurr) {
                    Array.from(listTarg.options).forEach((opt, i) => { if (opt.value === selCurr) listTarg.selectedIndex = i; });
                    listTarg.dispatchEvent(new Event('change'));
                }

            }
        });
    });
});
