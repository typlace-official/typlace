(function () {
  function renderStars(avg){
    const rounded = Math.round(avg || 0);
    let cls = "r1";
    if(avg >= 4.5) cls="r5";
    else if(avg >= 3.5) cls="r4";
    else if(avg >= 2.5) cls="r3";
    else if(avg >= 1.5) cls="r2";

    let html = `<span class="stars ${cls}">`;
    for(let i=1;i<=5;i++){
      html += `<span class="star ${i<=rounded ? "filled" : ""}">★</span>`;
    }
    html += `</span>`;
    return html;
  }

  function timeOnSite(createdAt){
    if (!createdAt) return "на сайте недавно";
    const diff = Date.now() - new Date(createdAt).getTime();
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (minutes < 60) return `на сайте ${minutes} мин`;
    if (hours < 24) return `на сайте ${hours} ч`;
    return `на сайте ${days} дн`;
  }

  function formatReviewsCount(n){
    if (window.tpI18n?.pluralKey) {
      return window.tpI18n.pluralKey("common.reviews_count", n);
    }
    return n + " reviews";
  }

  function getCurrentLang() {
    const lang = (localStorage.getItem("tp_lang") || "ru").trim().toLowerCase();
    return ["ru", "uk", "en"].includes(lang) ? lang : "ru";
  }

  function createOfferCard(o, opts = {}) {
    const {
      showHeart = false,
      heartActive = false,
      onHeartClick = null,
      onClick = null
    } = opts;

    const card = document.createElement("div");
    card.className = "offer-card";
    card.style.position = "relative";
    card.style.cursor = "pointer";

    const offerImage =
      o.imageUrl || o.imageDataUrl || o.image || "/img/offer-default.png";

    const seller = o.seller || {};
    const avatar =
      seller.avatarUrl || seller.avatarDataUrl || "/img/avatar-default.svg";

    const online = seller.online === true;
    const rating = seller.rating || 0;
    const reviews = seller.reviewsCount || 0;
    const onSiteText = timeOnSite(seller.createdAt);

    const currentLang = getCurrentLang();

    const title = (typeof window.buildOfferTitle === "function")
      ? window.buildOfferTitle(o)
      : (
          o.title?.[currentLang] ||
          o.title?.ru ||
          o.title?.uk ||
          o.title?.en ||
          o.mode ||
          "Предложение"
        );

    card.innerHTML = `
      ${showHeart ? `
        <div class="offer-heart ${heartActive ? "active" : ""}">
          <svg viewBox="0 0 24 24">
            <path d="M12 21s-7-4.35-10-8.5C-1.5 7.5 3 3 7.5 6.5
                     9.5 8 12 10.5 12 10.5S14.5 8 16.5 6.5
                     C21 3 25.5 7.5 22 12.5
                     19 16.65 12 21 12 21z"/>
          </svg>
        </div>
      ` : ""}

      <div class="offer-image">
        <img src="${offerImage}" onerror="this.src='/img/offer-default.png'">
      </div>

      <div class="offer-body">
        <div class="offer-title">${title}</div>
        <div class="offer-price" data-price="${o.price}">—</div>

        <div class="offer-seller">
          <div class="seller-avatar">
            <img src="${avatar}" onerror="this.src='/img/avatar-default.svg'">
            <span class="seller-status" style="background:${online ? "#22c55e" : "#9ca3af"}"></span>
          </div>

          <div>
            <div class="seller-name seller-profile-link"
                 data-user-id="${seller.userId || seller.id || seller._id || ""}">
              ${o.sellerName || seller.username || "Продавец"}
            </div>

            <div class="seller-rating"
                 data-user-id="${seller.userId || seller.id || seller._id || ""}">

              ${
                reviews === 0
                  ? `<span class="no-reviews">${window.tpI18n?.t("common.no_reviews") || "No reviews"}</span>`
                  : reviews < 10
                    ? `<span style="color:#6b7280;font-weight:600;">
                         ${formatReviewsCount(reviews)}
                       </span>`
                    : `${renderStars(rating)}
                       <span style="color:#6b7280;font-weight:600;">
                         ${formatReviewsCount(reviews)}
                       </span>`
              }
            </div>

            ${seller.createdAt ? `
              <div class="seller-profile-link seller-since"
                   data-user-id="${seller.userId || seller.id || seller._id || ""}"
                   style="font-size:12px;color:#6b7280;margin-top:2px;cursor:pointer;">
                ${onSiteText}
              </div>
            ` : ``}
          </div>
        </div>
      </div>
    `;

    const avatarBlock = card.querySelector(".seller-avatar");

    if (avatarBlock) {
      avatarBlock.addEventListener("click", (e) => {
        e.stopPropagation();
        const id = seller.userId || seller.id || seller._id;
        if (!id) return;

        const myId = localStorage.getItem("tp_user_id");

        if (id === myId) {
          location.href = "/profile.html";
        } else {
          location.href = "/profile.html?id=" + encodeURIComponent(id);
        }
      });
    }

    const profileLinks = card.querySelectorAll(".seller-profile-link");

    profileLinks.forEach(link => {
      link.addEventListener("click", (e) => {
        e.stopPropagation();

        const id = link.dataset.userId;
        if (!id) return;

        const myId = localStorage.getItem("tp_user_id");

        if (id === myId) {
          location.href = "/profile.html";
        } else {
          location.href = "/profile.html?id=" + encodeURIComponent(id);
        }
      });
    });

    const ratingBlock = card.querySelector(".seller-rating");
    if (ratingBlock) {
      ratingBlock.addEventListener("click", (e) => {
        e.stopPropagation();
        const id = ratingBlock.dataset.userId;
        if (!id) return;
        location.href = "/reviews.html?id=" + encodeURIComponent(id);
      });
    }

    card.addEventListener("click", () => {
      if (typeof onClick === "function") onClick(o);
      else location.href = "/offer.html?id=" + encodeURIComponent(o.id);
    });

    if (showHeart) {
      const heart = card.querySelector(".offer-heart");
      if (heart) {
        heart.addEventListener("click", (e) => {
          e.stopPropagation();
          if (typeof onHeartClick === "function") onHeartClick(o, card, heart);
        });
      }
    }

    return card;
  }

  async function updatePrices(root = document){
    if (!root) root = document;
    if (!window.tpMoney || typeof window.tpMoney.formatPrice !== "function") return;

    const els = root.querySelectorAll(".offer-price");

    for (const el of els) {
      const base = Number(el.dataset.price);

      if (!Number.isFinite(base)) continue;

      try {
        el.textContent = await window.tpMoney.formatPrice(base);
      } catch (e) {
        el.textContent = `${base}`;
      }
    }
  }

  window.tpOfferCard = { createOfferCard, updatePrices };
})();