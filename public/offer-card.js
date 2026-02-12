// card.js
function createOfferCard(o, currentMode, options = {}) {

  const {
    onClick = null,
    isFavorite = false,
    onToggleFavorite = null
  } = options;

  const card = document.createElement("div");
  card.className = "offer-card";
  card.style.position = "relative";
  card.style.cursor = "pointer";

  const offerImage = o.imageUrl || "/img/offer-default.png";

  card.innerHTML = `
    <div class="offer-heart ${isFavorite ? "active" : ""}">
      <svg viewBox="0 0 24 24">
        <path d="M12 21s-7-4.35-10-8.5C-1.5 7.5 3 3 7.5 6.5
                 9.5 8 12 10.5 12 10.5S14.5 8 16.5 6.5
                 C21 3 25.5 7.5 22 12.5
                 19 16.65 12 21 12 21z"/>
      </svg>
    </div>

    <div class="offer-image">
      ${
        currentMode !== "Робуксы" &&
        (o.stock || o.amount) &&
        Number(o.stock || o.amount) > 1
          ? `<div class="offer-amount-badge">×${o.stock || o.amount}</div>`
          : ``
      }
      <img src="${offerImage}" onerror="this.src='/img/offer-default.png'">
    </div>

    <div class="offer-body">
      <div class="offer-title"></div>
      <div class="offer-price" data-price="${o.price}">—</div>

      <div class="offer-seller"></div>
    </div>
  `;

  if (onClick) {
    card.addEventListener("click", onClick);
  }

  const heart = card.querySelector(".offer-heart");

  if (onToggleFavorite) {
    heart.addEventListener("click", (e)=>{
      e.stopPropagation();
      onToggleFavorite();
      heart.classList.toggle("active");
    });
  }

  return card;
}
