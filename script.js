// ============================================================
// JW Just Wishes — storefront logic
// Cart state, product rendering, live personalisation demo,
// and handing off to HitPay Checkout via /api/create-checkout-session
// =============================================================

// 运费规则：未满这个金额（分）收取固定运费；达到或超过则免运费。
// 这两个数字会同时用在①购物车画面显示 ②HitPay结账时真正收取的金额，
// 改这里的数字，购物车提示文字和实际收费会一起更新，不用改两个地方。
const FREE_SHIPPING_THRESHOLD_CENTS = 10000; // S$100.00 — 未满这个金额收运费
const SHIPPING_FEE_CENTS = 500; // S$5.00 — 未满门槛时收取的固定运费

// 名字卡字体选项（预览 + 下单备注）
const NAME_FONTS = [
  { id: "fraunces", label: "Elegant", family: "'Fraunces', serif" },
  { id: "fredoka", label: "Playful", family: "'Fredoka', sans-serif" },
  { id: "pacifico", label: "Script", family: "'Pacifico', cursive" },
];

// 各主题的岁数插图（key = 主题 id）
// Space: Space-01.png … Space-09.png；其它主题之后再补
const AGE_IMAGES_BY_THEME = {
  astro: {
    "1": "images/Space-01.png",
    "2": "images/Space-02.png",
    "3": "images/Space-03.png",
    "4": "images/Space-04.png",
    "5": "images/Space-05.png",
    "6": "images/Space-06.png",
    "7": "images/Space-07.png",
    "8": "images/Space-08.png",
    "9": "images/Space-09.png",
  },
};

// 礼包主题（对应名字卡设计图）
// overlay: 每张卡名字/岁数位置不同（百分比 + 字号）
const PACK_THEMES = [
  {
    id: "astro",
    label: "Space",
    image: "images/theme-astro.webp",
    overlay: {
      name: { top: "18%", left: "50%", fontSize: "23px" },
      age:  { top: "58%", left: "50%", fontSize: "2.4rem" },
    },
  },
  {
    id: "dino",
    label: "Dino",
    image: "images/theme-dino.webp",
    overlay: {
      name: { top: "22%", left: "50%", fontSize: "23px" },
      age:  { top: "42%", left: "72%", fontSize: "2.2rem" },
    },
  },
  {
    id: "mermaid",
    label: "Mermaid",
    image: "images/theme-mermaid.webp",
    overlay: {
      name: { top: "58%", left: "32%", fontSize: "23px" },
      age:  { top: "72%", left: "32%", fontSize: "1.5rem" },
    },
  },
  {
    id: "safari",
    label: "Safari",
    image: "images/theme-safari.webp",
    overlay: {
      name: { top: "48%", left: "50%", fontSize: "23px" },
      age:  { top: "60%", left: "58%", fontSize: "1.6rem" },
    },
  },
  {
    id: "unicorn",
    label: "Unicorn",
    image: "images/theme-unicorn.webp",
    overlay: {
      name: { top: "42%", left: "50%", fontSize: "23px" },
      age:  { top: "58%", left: "50%", fontSize: "2rem" },
    },
  },
];

const PRODUCTS = [
  {
    id: "signature-3d-wonder-box",
    name: "Signature 3D Wonder Box",
    ageLabel: null,
    desc: "Includes a personalised 3D-printed name tag, plus your choice of ANY 2 3D-printed keepsakes: Flickering Light, Dinosaur Egg (with a baby dino inside), Milk Box Holder, or Desk Organizer.",
    priceCents: 1280,
    priceLabel: "S$12.80",
    multiName: true,
    nameField: {
      label: "Names for the name tags (classmates)",
      placeholder: "Alicia\nMarcus\nZoe\n...(one name per line)",
      helper: "One name per line — each gets a 3D-printed name tag."
    },
    chooseOptions: {
      label: "Choose any 2 keepsakes (same for all)",
      max: 2,
      choices: [
        "Flickering Light",
        "Dinosaur Egg (with a baby dino inside)",
        "Milk Box Holder",
        "Desk Organizer",
      ],
    },
    image: "images/product-3d-keepsake-box.jpg",
  },
  {
    id: "engraved-canvas-pack",
    name: "Engraved Canvas Pack",
    ageLabel: "Ages 3+",
    desc: "Curated goodie bag: paint-your-own laser-engraved magnet, colour-your-own hand fan, bubble blower and an acrylic marker.",
    priceCents: 580,
    priceLabel: "S$5.80",
    image: "images/product-favor-bag.jpg",
  },
  {
    id: "routine-spark-pack",
    name: "Magic Routine Spark Pack",
    ageLabel: "Ages 2+",
    desc: "Curated goodie bag: 3D-printed routine checklist, multi-colour pen, mini notebook and a magnetic bookmark.",
    priceCents: 680,
    priceLabel: "S$6.80",
    image: "images/product-routine-space.jpg",
    // 主题卡预览（与 Charm Pack 共用主题）
    hasThemePreview: true,
  },
  {
    id: "routine-charm-pack",
    name: "Magic Routine Charm Pack",
    ageLabel: "Ages 2+",
    desc: "Curated goodie bag: 3D-printed routine checklist, inflatable hammer, foam sticker, kaleidoscope and a mosquito repellent band. Includes a printed gift bag (front & back design).",
    priceCents: 880,
    priceLabel: "S$8.80",
    image: "images/product-routine-sunshine.jpg",
    // 主题卡预览（共用）+ 袋子正反面预览
    hasThemePreview: true,
    hasBagPreview: true,
    bagFront: "images/bag-charm-front.webp",
    bagBack: "images/bag-charm-back.webp",
  },
];





// ---------------- Cart state ----------------
let cart = JSON.parse(localStorage.getItem("jw-cart") || "[]");

function saveCart() {
  localStorage.setItem("jw-cart", JSON.stringify(cart));
  renderCart();
}

function addToCart(product, personaliseValue, quantity = 1) {
  // 检查是否已有相同配置（相同商品ID + 相同个性化名字）
  const existingItem = cart.find(
    (item) => item.productId === product.id && item.personalise === (personaliseValue || "")
  );

  if (existingItem) {
    // 如果已经存在，直接增加数量（如果没有 quantity 字段则按 1 计算）
    existingItem.quantity = (existingItem.quantity || 1) + quantity;
  } else {
    // 如果是新组合，Push 进去并带上 quantity
    cart.push({
      lineId: crypto.randomUUID(),
      productId: product.id,
      name: product.name,
      priceCents: product.priceCents,
      priceLabel: product.priceLabel,
      personalise: personaliseValue || "",
      quantity: quantity,
    });
  }

  saveCart();
  openCart();
}

function removeFromCart(lineId) {
  cart = cart.filter((item) => item.lineId !== lineId);
  saveCart();
}

function cartSubtotalCents() {
  return cart.reduce((sum, item) => sum + item.priceCents * (item.quantity || 1), 0);
}

function formatSGD(cents) {
  return "S$" + (cents / 100).toFixed(2);
}


/*

// ---------------- Render: product grid ----------------
function renderProducts() {
  const grid = document.getElementById("productGrid");
  if (!grid) return; // 容错处理：如果当前页面没有 productGrid，安全退出

  grid.innerHTML = PRODUCTS.map((p) => `
    <div class="product-card" data-id="${p.id}">
      <div class="product-media">${p.image ? `<img src="${p.image}" alt="${p.name}" loading="lazy">` : ''}</div>
      <div class="product-body">
        <h3>${p.name}${p.ageLabel ? ` <span class="age-label">${p.ageLabel}</span>` : ""}</h3>
        <p class="product-desc">${p.desc}</p>
        <p class="product-price">${p.priceLabel}</p>
        <div class="field-row">
          <label for="personalise-${p.id}">${p.personalise.label}</label>
          <input id="personalise-${p.id}" type="text" placeholder="${p.personalise.placeholder}">
        </div>
        <button class="add-btn" data-add="${p.id}">Add to cart</button>
      </div>
    </div>
  `).join("");

  grid.querySelectorAll("[data-add]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const product = PRODUCTS.find((p) => p.id === btn.dataset.add);
      const input = document.getElementById(`personalise-${product.id}`);
      addToCart(product, input ? input.value.trim() : "");
      if (input) input.value = "";
    });
  });
}

*/




// ---------------- Render: product grid (listing cards) ----------------
function renderProducts() {
  const homeGrid = document.getElementById("popularGrid");
  const shopGrid = document.getElementById("productGrid");

  // 列表页只显示：图片、名称、价格、View 按钮 → 进入独立商品页
  const createListingCard = (p) => `
    <a class="product-card product-card-link" href="product.html?id=${encodeURIComponent(p.id)}">
      <div class="product-media">${p.image ? `<img src="${p.image}" alt="${p.name}" loading="lazy">` : ""}</div>
      <div class="product-body">
        <h3>${p.name}${p.ageLabel ? ` <span class="age-label">${p.ageLabel}</span>` : ""}</h3>
        <p class="product-desc listing-desc">${p.desc.length > 100 ? p.desc.slice(0, 100).trim() + "…" : p.desc}</p>
        <p class="product-price">${p.priceLabel}</p>
        <span class="btn-view">View &amp; customise →</span>
      </div>
    </a>`;

  if (homeGrid) {
    const popularItems = PRODUCTS.filter((p) => p.id === "signature-3d-wonder-box");
    homeGrid.innerHTML = popularItems.map(createListingCard).join("");
  }
  if (shopGrid) {
    shopGrid.innerHTML = PRODUCTS.map(createListingCard).join("");
  }
}

// ---------------- Render: product detail page ----------------
function renderProductPage() {
  const detailEl = document.getElementById("productDetail");
  if (!detailEl) return;

  const params = new URLSearchParams(window.location.search);
  const id = params.get("id");
  const product = PRODUCTS.find((p) => p.id === id);

  if (!product) {
    detailEl.innerHTML = `
      <p class="product-missing">Product not found.</p>
      <a href="shop.html" class="btn btn-primary">Back to shop</a>`;
    return;
  }

  document.title = `${product.name} — JW Just Wishes`;

  // 主题选项：有预览图的商品显示缩略图，其它只显示文字
  const themesHtml = PACK_THEMES.map((t, i) => `
    <label class="theme-option ${product.hasThemePreview ? "theme-option-thumb" : ""}">
      <input type="radio" name="pack-theme" value="${t.label}" data-theme-id="${t.id}" data-theme-image="${t.image || ""}" ${i === 0 ? "checked" : ""}>
      ${product.hasThemePreview && t.image
        ? `<span class="theme-thumb"><img src="${t.image}" alt="${t.label}"><span class="theme-thumb-label">${t.label}</span></span>`
        : `<span class="theme-card">${t.label}</span>`
      }
    </label>`).join("");

  const keepsakesHtml = product.chooseOptions
    ? `
    <div class="field-row choose-options" data-choose-group="${product.id}" data-max="${product.chooseOptions.max}">
      <label>${product.chooseOptions.label} <span class="choose-count" id="chooseCount-${product.id}">(0/${product.chooseOptions.max})</span></label>
      <div class="choose-options-list">
        ${product.chooseOptions.choices.map((choice) => `
          <label class="choose-option">
            <input type="checkbox" class="choose-checkbox" data-choose-group="${product.id}" value="${choice}">
            <span>${choice}</span>
          </label>`).join("")}
      </div>
    </div>`
    : "";

  const multiNameHtml = product.multiName
    ? `
    <div class="field-row">
      <label for="tagNames">${product.nameField.label}</label>
      <textarea id="tagNames" rows="4" placeholder="${product.nameField.placeholder}" class="name-textarea"></textarea>
      <p class="field-helper">${product.nameField.helper || ""}</p>
      <span class="name-count" id="tagNameCount">0 names</span>
    </div>`
    : "";

  // 主题卡实时预览（Spark + Charm 共用）
  const previewHtml = product.hasThemePreview
    ? `
    <div class="name-card-preview theme-image-preview" id="nameCardPreview" aria-live="polite">
      <p class="preview-label">Name card preview</p>
      <div class="theme-preview-frame">
        <img id="themePreviewImg" src="${PACK_THEMES[0].image}" alt="Theme preview">
        <p class="preview-name" id="previewName">Your name</p>
        <p class="preview-age" id="previewAge">—</p>
        <img class="preview-age-img" id="previewAgeImg" alt="Age" hidden>
      </div>
      <p class="field-helper">Preview updates as you type. Final print may vary slightly.</p>
    </div>`
    : "";

  // Charm Pack：袋子正反面翻转样板（图片可之后替换）
  const bagPreviewHtml = product.hasBagPreview
    ? `
    <div class="bag-preview" id="bagPreview">
      <p class="preview-label">Gift bag preview</p>
      <div class="bag-flip-scene">
        <div class="bag-flip-card" id="bagFlipCard">
          <div class="bag-face bag-face-front">
            ${product.bagFront
              ? `<img src="${product.bagFront}" alt="Bag front">`
              : `<div class="bag-placeholder">
                   <span class="bag-ph-title">Bag — Front</span>
                   <span class="bag-ph-sub">Design placeholder</span>
                 </div>`}
            <!-- 只有正面叠名字 + 岁数 -->
            <div class="bag-name-overlay">
              <p class="bag-preview-name" id="bagPreviewName">Your name</p>
              <p class="bag-preview-age" id="bagPreviewAge">Age —</p>
              <img class="bag-preview-age-img" id="bagPreviewAgeImg" alt="Age" hidden>
            </div>
          </div>
          <div class="bag-face bag-face-back">
            ${product.bagBack
              ? `<img src="${product.bagBack}" alt="Bag back">`
              : `<div class="bag-placeholder bag-placeholder-back">
                   <span class="bag-ph-title">Bag — Back</span>
                   <span class="bag-ph-sub">Design placeholder</span>
                 </div>`}
          </div>
        </div>
      </div>
      <button type="button" class="btn-flip-bag" id="btnFlipBag">Flip to see back</button>
      <p class="field-helper">Front shows name &amp; age. Flip to see the back design.</p>
    </div>`
    : "";

  detailEl.innerHTML = `
    <div class="product-detail-layout">
      <div class="product-detail-media">
        ${product.image ? `<img src="${product.image}" alt="${product.name}">` : ""}
      </div>
      <div class="product-detail-info">
        <h1>${product.name}${product.ageLabel ? ` <span class="age-label">${product.ageLabel}</span>` : ""}</h1>
        <p class="product-price product-detail-price">${product.priceLabel}</p>
        <p class="product-desc">${product.desc}</p>

        <div class="product-form">
          <div class="field-row">
            <label>Pack theme</label>
            <div class="theme-options ${product.hasThemePreview ? "theme-options-thumbs" : ""}" id="themeOptions">
              ${themesHtml}
            </div>
          </div>

          <div class="field-row">
            <label for="childName">Birthday child's name</label>
            <input id="childName" type="text" placeholder="e.g. Olivia" autocomplete="off">
            <p class="field-helper">For the name card we print for you.</p>
          </div>

          <div class="field-row">
            <label for="childAge">Age</label>
            <input id="childAge" type="text" inputmode="numeric" placeholder="e.g. 5" autocomplete="off" style="max-width: 120px;">
            <p class="field-helper">Used on the age card / print materials.</p>
          </div>

          ${product.hasThemePreview ? `
          <div class="field-row">
            <label>Name font</label>
            <div class="font-options" id="fontOptions">
              ${NAME_FONTS.map((f, i) => `
                <label class="font-option">
                  <input type="radio" name="name-font" value="${f.id}" data-font-family="${f.family}" ${i === 0 ? "checked" : ""}>
                  <span class="font-swatch" style="font-family: ${f.family}">${f.label}</span>
                </label>`).join("")}
            </div>
          </div>` : ""}

          ${previewHtml}
          ${bagPreviewHtml}

          ${keepsakesHtml}
          ${multiNameHtml}

          ${product.multiName ? `
          <p class="field-helper qty-note">Quantity = number of names you enter above (one name tag each).</p>
          ` : `
          <div class="field-row qty-row">
            <label for="productQty">Quantity</label>
            <input id="productQty" type="number" min="1" value="1" style="width: 70px; text-align: center;">
          </div>
          `}

          <button type="button" class="btn btn-primary btn-block" id="productAddBtn">Add to cart</button>
        </div>
      </div>
    </div>`;

  // 4选2 勾选限制
  detailEl.querySelectorAll(".choose-checkbox").forEach((box) => {
    box.addEventListener("change", () => {
      const groupId = box.dataset.chooseGroup;
      const groupBoxes = detailEl.querySelectorAll(`.choose-checkbox[data-choose-group="${groupId}"]`);
      const max = parseInt(detailEl.querySelector(`.choose-options[data-choose-group="${groupId}"]`)?.dataset.max || "2", 10);
      const checkedCount = Array.from(groupBoxes).filter((b) => b.checked).length;
      const countEl = document.getElementById(`chooseCount-${groupId}`);
      if (countEl) countEl.textContent = `(${checkedCount}/${max})`;
      groupBoxes.forEach((b) => {
        if (!b.checked) b.disabled = checkedCount >= max;
      });
    });
  });

  // 实时预览：名字 / 岁数 +（有主题图时）切换背景图
  const childNameInput = document.getElementById("childName");
  const childAgeInput = document.getElementById("childAge");
  const previewName = document.getElementById("previewName");
  const previewAge = document.getElementById("previewAge");
  const previewAgeImg = document.getElementById("previewAgeImg");
  const themePreviewImg = document.getElementById("themePreviewImg");

  const bagPreviewName = document.getElementById("bagPreviewName");
  const bagPreviewAge = document.getElementById("bagPreviewAge");
  const bagPreviewAgeImg = document.getElementById("bagPreviewAgeImg");

  const getSelectedThemeId = () =>
    detailEl.querySelector('input[name="pack-theme"]:checked')?.dataset?.themeId || "";

  const updateAgeDisplay = (textEl, imgEl, ageStr, withPrefix) => {
    const key = (ageStr || "").trim();
    const themeId = getSelectedThemeId();
    const imgSrc = AGE_IMAGES_BY_THEME[themeId]?.[key];
    if (imgSrc && imgEl) {
      imgEl.src = imgSrc;
      imgEl.hidden = false;
      if (textEl) textEl.hidden = true;
    } else {
      if (imgEl) imgEl.hidden = true;
      if (textEl) {
        textEl.hidden = false;
        textEl.textContent = key
          ? (withPrefix ? (key.match(/^\d+$/) ? `Age ${key}` : key) : key)
          : (withPrefix ? "Age —" : "—");
        textEl.classList.toggle("is-placeholder", !key);
      }
    }
  };

  const updatePreview = () => {
    const n = (childNameInput?.value || "").trim();
    const a = (childAgeInput?.value || "").trim();
    // 主题卡预览
    if (previewName) {
      previewName.textContent = n || "Your name";
      previewName.classList.toggle("is-placeholder", !n);
    }
    updateAgeDisplay(previewAge, previewAgeImg, a, false);
    // 袋子正面预览（只有正面有名字/岁数）
    if (bagPreviewName) {
      bagPreviewName.textContent = n || "Your name";
      bagPreviewName.classList.toggle("is-placeholder", !n);
    }
    updateAgeDisplay(bagPreviewAge, bagPreviewAgeImg, a, true);
  };

  const applyOverlayPosition = (el, pos) => {
    if (!el || !pos) return;
    el.style.top = pos.top || "50%";
    el.style.left = pos.left || "50%";
    el.style.fontSize = pos.fontSize || "1rem";
    el.style.transform = "translate(-50%, -50%)";
  };

  const updateThemeImage = () => {
    const selected = detailEl.querySelector('input[name="pack-theme"]:checked');
    const imgSrc = selected?.dataset?.themeImage;
    const themeId = selected?.dataset?.themeId;
    if (themePreviewImg && imgSrc) themePreviewImg.src = imgSrc;

    // 按主题切换名字/岁数位置（文字与插图共用）
    const theme = PACK_THEMES.find((t) => t.id === themeId) || PACK_THEMES[0];
    if (theme?.overlay) {
      applyOverlayPosition(previewName, theme.overlay.name);
      applyOverlayPosition(previewAge, theme.overlay.age);
      applyOverlayPosition(previewAgeImg, theme.overlay.age);
    }
  };

  if (childNameInput) childNameInput.addEventListener("input", updatePreview);
  if (childAgeInput) childAgeInput.addEventListener("input", updatePreview);
  detailEl.querySelectorAll('input[name="pack-theme"]').forEach((radio) => {
    radio.addEventListener("change", () => {
      updateThemeImage();
      updatePreview(); // 切换主题时刷新岁数图（Space 有图，其它暂用文字）
    });
  });

  const applyFont = () => {
    const selected = detailEl.querySelector('input[name="name-font"]:checked');
    const family = selected?.dataset?.fontFamily || NAME_FONTS[0].family;
    [previewName, previewAge, bagPreviewName, bagPreviewAge].forEach((el) => {
      if (el) el.style.fontFamily = family;
    });
  };
  detailEl.querySelectorAll('input[name="name-font"]').forEach((radio) => {
    radio.addEventListener("change", applyFont);
  });

  updatePreview();
  updateThemeImage();
  applyFont();

  // 袋子正反面翻转
  const bagFlipCard = document.getElementById("bagFlipCard");
  const btnFlipBag = document.getElementById("btnFlipBag");
  if (bagFlipCard && btnFlipBag) {
    let showingBack = false;
    btnFlipBag.addEventListener("click", () => {
      showingBack = !showingBack;
      bagFlipCard.classList.toggle("is-flipped", showingBack);
      btnFlipBag.textContent = showingBack ? "Flip to see front" : "Flip to see back";
    });
  }

  // 多名字计数
  const tagNames = document.getElementById("tagNames");
  const tagCount = document.getElementById("tagNameCount");
  if (tagNames && tagCount) {
    const update = () => {
      const n = tagNames.value.split(/\r?\n/).map((s) => s.trim()).filter(Boolean).length;
      tagCount.textContent = n === 0 ? "0 names" : n === 1 ? "1 name" : `${n} names`;
      tagCount.classList.toggle("has-names", n > 0);
    };
    tagNames.addEventListener("input", update);
  }

  // Add to cart
  const addBtn = document.getElementById("productAddBtn");
  if (addBtn) {
    addBtn.addEventListener("click", () => {
      const theme = detailEl.querySelector('input[name="pack-theme"]:checked')?.value || "";
      const childName = (document.getElementById("childName")?.value || "").trim();
      const childAge = (document.getElementById("childAge")?.value || "").trim();
      const qtyInput = document.getElementById("productQty");
      const qty = qtyInput ? (parseInt(qtyInput.value, 10) || 1) : 1;

      if (!theme) {
        alert("Please choose a pack theme.");
        return;
      }
      if (!childName) {
        alert("Please enter the birthday child's name.");
        return;
      }
      if (!childAge) {
        alert("Please enter the child's age.");
        return;
      }

      let selections = [];
      if (product.chooseOptions) {
        const checked = detailEl.querySelectorAll(`.choose-checkbox[data-choose-group="${product.id}"]:checked`);
        selections = Array.from(checked).map((b) => b.value);
        if (selections.length !== product.chooseOptions.max) {
          alert(`Please choose exactly ${product.chooseOptions.max} keepsakes (you picked ${selections.length}).`);
          return;
        }
      }

      let tagNamesList = [];
      if (product.multiName) {
        tagNamesList = (document.getElementById("tagNames")?.value || "")
          .split(/\r?\n/)
          .map((s) => s.trim())
          .filter(Boolean);
        if (tagNamesList.length === 0) {
          alert("Please enter at least one name for the name tags (one per line).");
          return;
        }
      }

      const fontId = detailEl.querySelector('input[name="name-font"]:checked')?.value || "";
      const fontLabel = NAME_FONTS.find((f) => f.id === fontId)?.label || fontId;

      // 整理给商家看的个性化信息
      const parts = [
        `Theme: ${theme}`,
        `Child: ${childName}`,
        `Age: ${childAge}`,
      ];
      if (fontLabel) parts.push(`Font: ${fontLabel}`);
      if (selections.length) parts.push(`Keepsakes: ${selections.join(", ")}`);
      if (tagNamesList.length) parts.push(`Name tags (${tagNamesList.length}): ${tagNamesList.join(", ")}`);

      const personaliseText = parts.join(" | ");

      // 多名字商品：数量 = 名字个数（不再乘 Quantity）
      // 普通商品：用 Quantity
      const finalQty = product.multiName ? tagNamesList.length : qty;
      addToCart(product, personaliseText, finalQty);

      addBtn.textContent = "Added ✓";
      setTimeout(() => { addBtn.textContent = "Add to cart"; }, 1500);

      // 打开购物车方便确认
      const drawer = document.getElementById("cartDrawer");
      const overlay = document.getElementById("cartOverlay");
      if (drawer) drawer.classList.add("open");
      if (overlay) overlay.classList.add("open");
    });
  }
}

// ---------------- Render: cart drawer （Total-discount) ----------------
function renderCart() {
  const itemsEl = document.getElementById("cartItems");
  const countEl = document.getElementById("cartCount");
  const subTotalEl = document.getElementById("cartSubtotal");

  // 计算购物车商品总件数
  const totalItemsCount = cart.reduce((sum, item) => sum + (item.quantity || 1), 0);
  if (countEl) countEl.textContent = totalItemsCount;

  // 渲染购物车内的商品列表
  if (itemsEl) {
    if (cart.length === 0) {
      itemsEl.innerHTML = "<p style='padding: 1em 0; color: #888;'>Your cart is empty.</p>";
    } else {
      itemsEl.innerHTML = cart.map((item) => {
        // 把 "10 names: A, B, C — keepsakes" 拆成更易读的显示
        let personaliseHtml = "";
        if (item.personalise) {
          const multiMatch = item.personalise.match(/^(\d+)\s+names:\s*(.+?)\s*—\s*(.+)$/i);
          if (multiMatch) {
            const [, count, namesList, keepsakes] = multiMatch;
            personaliseHtml = `
              <small class="cart-personalise">
                <span class="cart-names-label">${count} name tags:</span>
                <span class="cart-names-list">${namesList}</span>
                <span class="cart-keepsakes">Keepsakes: ${keepsakes}</span>
              </small>`;
          } else {
            personaliseHtml = `<small class="cart-personalise">For: ${item.personalise}</small>`;
          }
        }

        return `
        <div class="cart-item">
          <div class="cart-item-info">
            <strong class="cart-item-name">${item.name}</strong>
            ${personaliseHtml}
            <span class="cart-item-price">${item.priceLabel} each</span>
          </div>
          <div class="cart-item-controls">
            <button class="qty-btn" onclick="updateCartQty('${item.lineId}', -1)">−</button>
            <span class="qty-num">${item.quantity || 1}</span>
            <button class="qty-btn" onclick="updateCartQty('${item.lineId}', 1)">+</button>
            <button class="remove-btn" onclick="removeFromCart('${item.lineId}')" title="Remove">✕</button>
          </div>
        </div>`;
      }).join("");
    }
  }

  // 计算并显示总金额（含折扣）
  let effectiveSubtotalCents = 0; // 折扣后的商品小计（没折扣的话等于原价）
  if (subTotalEl) {
    const rawCents = cartSubtotalCents();
    if (typeof getCalculatedSubtotal === "function" && appliedDiscount) {
      const finalCents = Math.round(getCalculatedSubtotal() * 100);
      effectiveSubtotalCents = finalCents;
      subTotalEl.innerHTML = `
        <span style="text-decoration: line-through; color: #999; font-size: 0.85em;">${formatSGD(rawCents)}</span>
        <strong style="color: #2e7d32; margin-left: 6px;">${formatSGD(finalCents)}</strong>
      `;
    } else {
      effectiveSubtotalCents = rawCents;
      subTotalEl.textContent = formatSGD(rawCents);
    }
  }

  // 运费：未满门槛收固定运费，达到门槛免运费（以折扣后的金额来判断）
  const shippingFeeCents = cart.length === 0
    ? 0
    : (effectiveSubtotalCents >= FREE_SHIPPING_THRESHOLD_CENTS ? 0 : SHIPPING_FEE_CENTS);

  const shippingRowEl = document.getElementById("cartShipping");
  const shippingRowContainer = shippingRowEl ? shippingRowEl.closest(".cart-shipping-row") : null;
  if (shippingRowEl) {
    if (cart.length === 0) {
      shippingRowEl.textContent = formatSGD(0);
      if (shippingRowContainer) shippingRowContainer.classList.remove("free-shipping");
    } else if (shippingFeeCents === 0) {
      shippingRowEl.textContent = "FREE";
      if (shippingRowContainer) shippingRowContainer.classList.add("free-shipping");
    } else {
      shippingRowEl.textContent = formatSGD(shippingFeeCents);
      if (shippingRowContainer) shippingRowContainer.classList.remove("free-shipping");
    }
  }

  const totalEl = document.getElementById("cartTotal");
  if (totalEl) {
    totalEl.textContent = formatSGD(effectiveSubtotalCents + shippingFeeCents);
  }

  // 显示"还差多少钱可以免运费"的提示
  const shippingEl = document.getElementById("shippingNudge");
  if (shippingEl) {
    if (cart.length === 0) {
      shippingEl.innerHTML = "";
      shippingEl.classList.remove("reached");
    } else if (effectiveSubtotalCents >= FREE_SHIPPING_THRESHOLD_CENTS) {
      shippingEl.classList.add("reached");
      shippingEl.innerHTML = `🎉 You've unlocked free shipping!`;
    } else {
      shippingEl.classList.remove("reached");
      const remainingCents = FREE_SHIPPING_THRESHOLD_CENTS - effectiveSubtotalCents;
      const pct = Math.min(100, Math.round((effectiveSubtotalCents / FREE_SHIPPING_THRESHOLD_CENTS) * 100));
      shippingEl.innerHTML = `
        Add ${formatSGD(remainingCents)} more for free shipping!
        <div class="shipping-nudge-bar-track">
          <div class="shipping-nudge-bar-fill" style="width:${pct}%"></div>
        </div>
      `;
    }
  }
}

  
function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}





// ---------------- Cart drawer open/close ----------------
const cartDrawer = document.getElementById("cartDrawer");
const cartOverlay = document.getElementById("cartOverlay");
const cartToggle = document.getElementById("cartToggle");
const cartClose = document.getElementById("cartClose");

function openCart() {
  if (cartDrawer) cartDrawer.classList.add("open");
  if (cartOverlay) cartOverlay.classList.add("open");
}
function closeCart() {
  if (cartDrawer) cartDrawer.classList.remove("open");
  if (cartOverlay) cartOverlay.classList.remove("open");
}

if (cartToggle) cartToggle.addEventListener("click", openCart);
if (cartClose) cartClose.addEventListener("click", closeCart);
if (cartOverlay) cartOverlay.addEventListener("click", closeCart);


// ---------------- Checkout ----------------
// 结账按钮逻辑 (替换现有 checkoutBtn 事件)
const checkoutBtn = document.getElementById("checkoutBtn");
if (checkoutBtn) {
  checkoutBtn.addEventListener("click", async () => {
    if (cart.length === 0) return;

    // 1. 获取原价总分值 (Cents) — 仅用于购物车画面显示，实际折扣金额由后端重新计算
    const rawCents = cartSubtotalCents();

    checkoutBtn.disabled = true;
    checkoutBtn.textContent = "Redirecting to payment…";

    try {
      const res = await fetch("/api/create-checkout-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cart: cart,
          discountCode: appliedDiscount ? appliedDiscount.code : null, // 只送代码，不送金额
        }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || "Checkout session request failed");
      }
      const data = await res.json();

      if (data.url) {
        window.location.href = data.url;
      } else {
        throw new Error("No checkout URL returned");
      }
    } catch (err) {
      console.error(err);
      alert("Sorry, checkout could not be started. " + (err.message || ""));
      checkoutBtn.disabled = false;
      checkoutBtn.textContent = "Checkout";
    }
  });
}

// ---------------- 购物车内修改数量 ----------------
function updateCartQty(lineId, change) {
  const item = cart.find((i) => i.lineId === lineId);
  if (!item) return;

  item.quantity = (item.quantity || 1) + change;

  // 如果数量减到 0，则从购物车移除
  if (item.quantity <= 0) {
    cart = cart.filter((i) => i.lineId !== lineId);
  }

  saveCart(); // 保存并重新渲染购物车
}

// ---------------- Safe Init ----------------
function safeInit() {
  try {
    if (typeof renderProducts === "function") {
      renderProducts();
    }
  } catch (e) {
    console.error("renderProducts error:", e);
  }

  try {
    if (typeof renderProductPage === "function") {
      renderProductPage();
    }
  } catch (e) {
    console.error("renderProductPage error:", e);
  }

  try {
    if (typeof renderCart === "function") {
      renderCart();
    }
  } catch (e) {
    console.error("renderCart error:", e);
  }
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", safeInit);
} else {
  safeInit();
}




// ---------------- Mobile Menu Animation ----------------
const menuToggle = document.getElementById("menuToggle");
const navLinks = document.querySelector(".nav-links");

if (menuToggle && navLinks) {
  menuToggle.addEventListener("click", () => {
    menuToggle.classList.toggle("open"); // 触发三条杠旋转成 X 的动画
    navLinks.classList.toggle("active"); // 触发菜单向下展开
  });
}



// ==================== 折扣码 Discount Code 功能 ====================
// 折扣码不再写死在前端(任何人打开浏览器原始码都能看到并盗用)。
// 现在改成呼叫后端 /api/validate-discount 做验证，
// 折扣码是否有效、是否已被使用过，都是由服务器和 KV 数据库决定，
// 前端只负责显示结果，无法被绕过或重复使用。

let appliedDiscount = null; // 记录当前已验证生效的折扣 {code, type, value, label}

document.addEventListener("DOMContentLoaded", function() {
  const applyBtn = document.getElementById("applyDiscountBtn");
  const discountInput = document.getElementById("discountCodeInput");
  const discountMsg = document.getElementById("discountMessage");

  if (applyBtn && discountInput) {
    applyBtn.addEventListener("click", async function() {
      const code = discountInput.value.trim().toUpperCase();

      if (!code) {
        discountMsg.textContent = "Please enter a discount code.";
        discountMsg.style.color = "#d32f2f";
        return;
      }

      applyBtn.disabled = true;
      applyBtn.textContent = "Checking…";

      try {
        const res = await fetch("/api/validate-discount", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ code }),
        });
        const data = await res.json();

        if (data.valid) {
          appliedDiscount = { code, type: data.type, value: data.value, label: data.label };
          discountMsg.textContent = `Applied: ${data.label}`;
          discountMsg.style.color = "#2e7d32";
        } else {
          appliedDiscount = null;
          discountMsg.textContent = data.message || "Invalid or already-used code.";
          discountMsg.style.color = "#d32f2f";
        }
      } catch (err) {
        console.error(err);
        appliedDiscount = null;
        discountMsg.textContent = "Could not check this code right now, please try again.";
        discountMsg.style.color = "#d32f2f";
      }

      applyBtn.disabled = false;
      applyBtn.textContent = "Apply";
      if (typeof renderCart === "function") renderCart();
    });
  }
});



// 3. 获取折后总价的辅助函数 (用于结算或更新UI)
function getCalculatedSubtotal() {
  // 假设原购物车计算总价的函数为 cartSubtotalCents / 100 或直接读取原小计
  let rawTotal = 0;
  if (typeof cartSubtotalCents === "function") {
    rawTotal = cartSubtotalCents() / 100;
  }

  if (!appliedDiscount) return rawTotal;

  if (appliedDiscount.type === "percent") {
    return Math.max(0, rawTotal * (1 - appliedDiscount.value / 100));
  } else if (appliedDiscount.type === "fixed") {
    return Math.max(0, rawTotal - appliedDiscount.value);
  }

  return rawTotal;
}

// ---------------- Banner 自动轮播旋转逻辑 ----------------
function initHeroCarousel() {
  const track = document.getElementById("carouselTrack");
  if (!track) return;

  const cards = Array.from(track.querySelectorAll(".carousel-card"));
  if (cards.length === 0) return;

  let currentIndex = 0;

  function updateCarousel() {
    cards.forEach((card, i) => {
      card.classList.remove("active", "prev", "next");

      if (i === currentIndex) {
        card.classList.add("active");
      } else if (i === (currentIndex - 1 + cards.length) % cards.length) {
        card.classList.add("prev");
      } else if (i === (currentIndex + 1) % cards.length) {
        card.classList.add("next");
      }
    });
  }

  // 3 秒自动轮播切换一次
  setInterval(() => {
    currentIndex = (currentIndex + 1) % cards.length;
    updateCarousel();
  }, 3000);

  // 初始化首次位置
  updateCarousel();
}

// 页面加载完成后启动轮播
document.addEventListener("DOMContentLoaded", () => {
  initHeroCarousel();
});
