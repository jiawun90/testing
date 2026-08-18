// ============================================================
// JW Just Wishes — storefront logic
// Cart state, product rendering, live personalisation demo,
// and handing off to Stripe Checkout via /api/create-checkout-session
// =============================================================

// 运费规则：未满这个金额（分）收取固定运费；达到或超过则免运费。
// 这两个数字会同时用在①购物车画面显示 ②Stripe结账时真正收取的金额，
// 改这里的数字，购物车提示文字和实际收费会一起更新，不用改两个地方。
const FREE_SHIPPING_THRESHOLD_CENTS = 10000; // S$100.00 — 未满这个金额收运费
const SHIPPING_FEE_CENTS = 500; // S$5.00 — 未满门槛时收取的固定运费

const PRODUCTS = [
    {
    id: "signature-3d-wonder-box",
    name: "Signature 3D Wonder Box",
    ageLabel: null,
    desc: "Includes a personalised 3D-printed name tag, plus your choice of ANY 2 3D-printed keepsakes: Flickering Light, Dinosaur Egg (with a baby dino inside), Milk Box Holder, or Desk Organizer.",
    priceCents: 1280, // S$12.80
    priceLabel: "S$12.80",
    // 支援一次输入多个名字（一行一个），适合班级派对一次订多个 name tag
    multiName: true,
    nameField: {
      label: "Names for the name tags",
      placeholder: "Alicia\nMarcus\nZoe\n...(one name per line)",
      helper: "Enter one name per line. Each name gets its own 3D-printed name tag."
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
    priceCents: 580, // S$5.80
    priceLabel: "S$5.80",
    personalise: { label: "Name for the wish card", placeholder: "Olivia" },
    image: "images/product-favor-bag.jpg",
  },
  {
    id: "routine-spark-pack",
    name: "Magic Routine Spark Pack",
    ageLabel: "Ages 2+",
    desc: "Curated goodie bag: 3D-printed routine checklist, multi-colour pen, mini notebook and a magnetic bookmark.",
    priceCents: 680, // S$6.80
    priceLabel: "S$6.80",
    personalise: { label: "Name for the wish card", placeholder: "Estelle" },
    image: "images/product-routine-space.jpg",
  },
  {
    id: "routine-charm-pack",
    name: "Magic Routine Charm Pack",
    ageLabel: "Ages 2+",
    desc: "Curated goodie bag: 3D-printed routine checklist, inflatable hammer, foam sticker, kaleidoscope and a mosquito repellent band.",
    priceCents: 880, // S$8.80
    priceLabel: "S$8.80",
    personalise: { label: "Name for the wish card", placeholder: "Oliver" },
    image: "images/product-routine-sunshine.jpg",
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




// ---------------- Render: product grid ----------------
// ---------------- Render: product grid ----------------
function renderProducts() {
  const homeGrid = document.getElementById("popularGrid"); // Home page container
  const shopGrid = document.getElementById("productGrid");  // Shop page container

  // Helper function to build the HTML string
  const createMarkup = (items) => items.map((p) => `
    <div class="product-card" data-id="${p.id}">
      <div class="product-media">${p.image ? `<img src="${p.image}" alt="${p.name}" loading="lazy">` : ''}</div>
      <div class="product-body">
        <h3>${p.name}${p.ageLabel ? ` <span class="age-label">${p.ageLabel}</span>` : ""}</h3>
        <p class="product-desc">${p.desc}</p>
        <p class="product-price">${p.priceLabel}</p>

        ${p.chooseOptions ? `
          <!-- 名字栏（支援多行 / 单行） -->
          <div class="field-row">
            <label for="personalise-${p.id}">${p.nameField.label}</label>
            ${p.multiName
              ? `<textarea id="personalise-${p.id}" rows="4" placeholder="${p.nameField.placeholder}" class="name-textarea" data-product-id="${p.id}"></textarea>
                 <div class="name-meta">
                   <span class="name-count" id="nameCount-${p.id}">0 names</span>
                   <span class="field-helper">${p.nameField.helper || "One name per line."}</span>
                 </div>`
              : `<input id="personalise-${p.id}" type="text" placeholder="${p.nameField.placeholder}">`
            }
          </div>
          <!-- 4选2 勾选栏 -->
          <div class="field-row choose-options" data-choose-group="${p.id}" data-max="${p.chooseOptions.max}">
            <label>${p.chooseOptions.label} <span class="choose-count" id="chooseCount-${p.id}">(0/${p.chooseOptions.max})</span></label>
            <div class="choose-options-list">
              ${p.chooseOptions.choices.map((choice) => `
                <label class="choose-option">
                  <input type="checkbox" class="choose-checkbox" data-choose-group="${p.id}" value="${choice}">
                  <span>${choice}</span>
                </label>
              `).join("")}
            </div>
          </div>
        ` : `
          <!-- 个性化文字输入框 -->
          <div class="field-row">
            <label for="personalise-${p.id}">${p.personalise.label}</label>
            <input id="personalise-${p.id}" type="text" placeholder="${p.personalise.placeholder}">
          </div>
        `}

        <!-- 数量选择框 + 按钮（多名字商品不显示数量，因为名字数量决定件数） -->
        <div style="display: flex; gap: 0.5em; align-items: center; margin-top: 1em;">
          ${p.multiName ? "" : `
          <div style="display: flex; align-items: center; gap: 0.3em;">
            <label for="qty-${p.id}" style="margin: 0; font-size: 0.9em;">Qty:</label>
            <input id="qty-${p.id}" type="number" min="1" value="1" style="width: 50px; text-align: center; padding: 0.4em;">
          </div>`}
          <button class="add-btn" data-add="${p.id}" id="addBtn-${p.id}" style="flex: 1; margin: 0;">Add to cart</button>
        </div>
      </div>
    </div>
  `).join("");

  // Helper: 4选2 勾选栏 — 选满上限后，其余未勾选的选项自动disable，
  // 避免客人不小心选超过限制
  const bindChooseOptions = (container) => {
    container.querySelectorAll(".choose-checkbox").forEach((box) => {
      box.addEventListener("change", () => {
        const groupId = box.dataset.chooseGroup;
        const groupBoxes = container.querySelectorAll(`.choose-checkbox[data-choose-group="${groupId}"]`);
        const max = parseInt(container.querySelector(`.choose-options[data-choose-group="${groupId}"]`)?.dataset.max || "2", 10);
        const checkedCount = Array.from(groupBoxes).filter((b) => b.checked).length;

        const countEl = document.getElementById(`chooseCount-${groupId}`);
        if (countEl) countEl.textContent = `(${checkedCount}/${max})`;

        groupBoxes.forEach((b) => {
          if (!b.checked) b.disabled = checkedCount >= max;
        });
      });
    });
  };

  // Helper: 多名字商品 — 实时显示已输入名字数量 + 更新按钮文字
  const bindNameCount = (container) => {
    container.querySelectorAll(".name-textarea").forEach((textarea) => {
      const productId = textarea.dataset.productId;
      const countEl = document.getElementById(`nameCount-${productId}`);
      const addBtn = document.getElementById(`addBtn-${productId}`);

      const updateCount = () => {
        const names = textarea.value
          .split(/\r?\n/)
          .map((n) => n.trim())
          .filter((n) => n.length > 0);
        const n = names.length;
        if (countEl) {
          countEl.textContent = n === 0 ? "0 names" : n === 1 ? "1 name" : `${n} names`;
          countEl.classList.toggle("has-names", n > 0);
        }
        if (addBtn) {
          addBtn.textContent = n === 0 ? "Add to cart" : n === 1 ? "Add 1 name tag" : `Add ${n} name tags`;
        }
      };

      textarea.addEventListener("input", updateCount);
      updateCount(); // 初始状态
    });
  };

  // Helper function to attach event listeners to buttons
  const bindEvents = (container) => {
    bindChooseOptions(container);
    bindNameCount(container);

    container.querySelectorAll("[data-add]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const product = PRODUCTS.find((p) => p.id === btn.dataset.add);
        if (!product) return;

        const input = document.getElementById(`personalise-${product.id}`);
        const qtyInput = document.getElementById(`qty-${product.id}`);
        const qty = qtyInput ? (parseInt(qtyInput.value, 10) || 1) : 1;

        if (product.chooseOptions) {
          const checkedBoxes = container.querySelectorAll(
            `.choose-checkbox[data-choose-group="${product.id}"]:checked`
          );
          const selections = Array.from(checkedBoxes).map((b) => b.value);

          if (selections.length !== product.chooseOptions.max) {
            alert(`Please choose exactly ${product.chooseOptions.max} keepsakes (you picked ${selections.length}).`);
            return;
          }

          // 多名字模式：一次加入，数量 = 名字数量，购物车只显示一条
          if (product.multiName) {
            const raw = input ? input.value : "";
            const names = raw
              .split(/\r?\n/)
              .map((n) => n.trim())
              .filter((n) => n.length > 0);

            if (names.length === 0) {
              alert("Please enter at least one name (one name per line).");
              return;
            }

            // 把所有名字整理成清晰的一串，方便你后台看到
            const personaliseText = `${names.length} names: ${names.join(", ")} — ${selections.join(", ")}`;
            addToCart(product, personaliseText, names.length);
          } else {
            // 单名字模式
            const name = input ? input.value.trim() : "";
            if (!name) {
              alert(`Please enter a ${product.nameField.label.toLowerCase()}.`);
              return;
            }
            const personaliseText = `${name} — ${selections.join(", ")}`;
            addToCart(product, personaliseText, qty);
          }
        } else {
          // 普通个性化商品（wish card 等）
          const personaliseText = input ? input.value.trim() : "";
          addToCart(product, personaliseText, qty);
        }

        // 清空表单 + 重置计数和按钮文字
        if (input) input.value = "";
        if (qtyInput) qtyInput.value = "1";
        if (product.chooseOptions) {
          container.querySelectorAll(`.choose-checkbox[data-choose-group="${product.id}"]`).forEach((b) => {
            b.checked = false;
            b.disabled = false;
          });
          const countEl = document.getElementById(`chooseCount-${product.id}`);
          if (countEl) countEl.textContent = `(0/${product.chooseOptions.max})`;
        }
        // 重置多名字计数和按钮
        const nameCountEl = document.getElementById(`nameCount-${product.id}`);
        if (nameCountEl) {
          nameCountEl.textContent = "0 names";
          nameCountEl.classList.remove("has-names");
        }
        const addBtn = document.getElementById(`addBtn-${product.id}`);
        if (addBtn) addBtn.textContent = "Add to cart";
      });
    });
  };

  // 1. Home Page (index.html): Show Popular Pick only
  if (homeGrid) {
    const popularItems = PRODUCTS.filter((p) => p.id === "signature-3d-wonder-box");
    homeGrid.innerHTML = createMarkup(popularItems);
    bindEvents(homeGrid);
  }

  // 2. Shop Page (shop.html): Show ALL products
  if (shopGrid) {
    shopGrid.innerHTML = createMarkup(PRODUCTS);
    bindEvents(shopGrid);
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
