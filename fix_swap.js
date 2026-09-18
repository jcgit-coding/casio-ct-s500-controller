document.addEventListener('DOMContentLoaded', () => {
    const swapBtns = document.querySelectorAll('.btn-swap');
    
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

                // Update active state of buttons in BOTH cards
                updateSwapBtnsActive(cardCurrent, currentPart);
                updateSwapBtnsActive(cardTarget, targetPart);
            }
        });
    });

    function updateSwapBtnsActive(card, activeTarget) {
        const btns = card.querySelectorAll('.btn-swap');
        btns.forEach(b => {
            if (b.getAttribute('data-target') === activeTarget) {
                b.classList.add('active');
            } else {
                b.classList.remove('active');
            }
        });
    }
});
