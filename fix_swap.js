document.addEventListener('DOMContentLoaded', () => {
    const swapBtns = document.querySelectorAll('.btn-swap');
    
    // Almacenar el nombre original (con el spam dim opcional) basado en su order
    const titlesByOrder = {
        '1': 'INSTRUMENTO 1',
        '2': 'INSTRUMENTO 2 <span class="dim">Layer</span>',
        '3': 'INSTRUMENTO 3 <span class="dim">Split</span>'
    };

    swapBtns.forEach(btn => {
        btn.addEventListener('click', (e) => {
            const targetPart = btn.getAttribute('data-target'); // e.g., 'U2'
            const currentPart = btn.closest('.track-card').getAttribute('data-part'); // e.g., 'U1'
            
            if (targetPart === currentPart) return;

            const cardCurrent = document.getElementById(`card-${currentPart}`);
            const cardTarget = document.getElementById(`card-${targetPart}`);

            if (cardCurrent && cardTarget) {
                // Swap flex order
                const currentOrder = cardCurrent.style.order || getComputedStyle(cardCurrent).order;
                const targetOrder = cardTarget.style.order || getComputedStyle(cardTarget).order;

                cardCurrent.style.order = targetOrder;
                cardTarget.style.order = currentOrder;
                
                // Swap the column titles so "Instrumento X" stays physically fixed
                const titleCurrent = cardCurrent.querySelector('.inst-title');
                const titleTarget = cardTarget.querySelector('.inst-title');
                
                if (titleCurrent && titlesByOrder[targetOrder]) {
                    titleCurrent.innerHTML = titlesByOrder[targetOrder];
                }
                if (titleTarget && titlesByOrder[currentOrder]) {
                    titleTarget.innerHTML = titlesByOrder[currentOrder];
                }

                // The active button always stays the same as data-part because the card carries its own buttons.
            }
        });
    });
});
