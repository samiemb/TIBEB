document.addEventListener('DOMContentLoaded', () => {
    const API = {
        async fetchProducts(params = {}) {
            const usp = new URLSearchParams();
            Object.entries(params).forEach(([k, v]) => {
                if (v !== undefined && v !== null && String(v).length > 0) usp.set(k, v);
            });
            const res = await fetch(`/api/products?${usp.toString()}`);
            if (!res.ok) throw new Error('Failed to load products');
            return res.json();
        },
        async fetchProduct(id) {
            const res = await fetch(`/api/products/${id}`);
            if (!res.ok) throw new Error('Not found');
            return res.json();
        },
        async placeOrder(items) {
            const token = localStorage.getItem('token');
            const res = await fetch('/api/orders', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...(token ? { Authorization: `Bearer ${token}` } : {})
                },
                body: JSON.stringify({ items })
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Order failed');
            return data;
        },
        async myOrders() {
            const token = localStorage.getItem('token');
            const res = await fetch('/api/orders/my', {
                headers: token ? { Authorization: `Bearer ${token}` } : {}
            });
            if (!res.ok) throw new Error('Failed to load orders');
            return res.json();
        },
        async me() {
            const token = localStorage.getItem('token');
            const res = await fetch('/api/me', { headers: token ? { Authorization: `Bearer ${token}` } : {} });
            if (!res.ok) throw new Error('Failed to load profile');
            return res.json();
        },
        async adminCreateProduct(payload) {
            const token = localStorage.getItem('token');
            const res = await fetch('/api/products', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...(token ? { Authorization: `Bearer ${token}` } : {})
                },
                body: JSON.stringify(payload)
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Create failed');
            return data;
        },
        async adminUpdateProduct(id, payload) {
            const token = localStorage.getItem('token');
            const res = await fetch(`/api/products/${id}`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    ...(token ? { Authorization: `Bearer ${token}` } : {})
                },
                body: JSON.stringify(payload)
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Update failed');
            return data;
        },
        async adminDeleteProduct(id) {
            const token = localStorage.getItem('token');
            const res = await fetch(`/api/products/${id}`, {
                method: 'DELETE',
                headers: token ? { Authorization: `Bearer ${token}` } : {}
            });
            if (!res.ok) throw new Error('Delete failed');
            return res.json();
        },
        async adminUploadImages(id, files) {
            const token = localStorage.getItem('token');
            const fd = new FormData();
            for (const f of files) fd.append('images', f);
            const res = await fetch(`/api/products/${id}/images`, {
                method: 'POST',
                headers: token ? { Authorization: `Bearer ${token}` } : {},
                body: fd
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Upload failed');
            return data;
        }
    };

    const Cart = {
        read() {
            try { return JSON.parse(localStorage.getItem('cart') || '[]'); } catch { return []; }
        },
        write(items) {
            localStorage.setItem('cart', JSON.stringify(items));
        },
        add(product, quantity = 1) {
            const items = this.read();
            const idx = items.findIndex(i => i.product === product);
            if (idx >= 0) items[idx].quantity += quantity; else items.push({ product, quantity });
            this.write(items);
        },
        remove(product) {
            const items = this.read().filter(i => i.product !== product);
            this.write(items);
        },
        setQuantity(product, quantity) {
            const items = this.read();
            const idx = items.findIndex(i => i.product === product);
            if (idx >= 0) {
                items[idx].quantity = Math.max(1, quantity);
                this.write(items);
            }
        },
        clear() { this.write([]); }
    };

    function productCard(p) {
        const img = Array.isArray(p.images) && p.images.length ? p.images[0] : 'img/main.jpg';
        const safeName = (p.name || '').replace(/</g, '&lt;');
        const price = Number(p.price || 0).toFixed(2);
        return `
            <div class="col-3">
                <img src="${img}" alt="${safeName}">
                <h4>${safeName}</h4>
                <p>${price} ETB</p>
                <button type="button" class="butn add-to-cart" data-product-id="${p._id}">ADD TO CART</button>
            </div>
        `;
    }

    async function renderProductGrid(container, params) {
        container.innerHTML = '<p>Loading...</p>';
        try {
            const { items } = await API.fetchProducts(params);
            if (!items.length) {
                container.innerHTML = '<p>No products found.</p>';
                return;
            }
            container.innerHTML = items.map(productCard).join('');
        } catch (e) {
            container.innerHTML = `<p>${e.message}</p>`;
        }
        container.querySelectorAll('.add-to-cart').forEach(btn => {
            btn.addEventListener('click', () => {
                const id = btn.getAttribute('data-product-id');
                Cart.add(id, 1);
                alert('Added to cart');
            });
        });
    }

    // Product listing/search pages
    const grid = document.getElementById('products-container');
    if (grid) {
        const category = grid.getAttribute('data-category') || undefined;
        const searchForm = document.querySelector('.product-search-form');
        const qInput = document.getElementById('search-q');
        const minInput = document.getElementById('min-price');
        const maxInput = document.getElementById('max-price');

        function currentParams() {
            return {
                q: qInput ? qInput.value.trim() : undefined,
                category,
                minPrice: minInput ? minInput.value : undefined,
                maxPrice: maxInput ? maxInput.value : undefined,
                limit: 20
            };
        }

        renderProductGrid(grid, currentParams());
        if (searchForm) {
            searchForm.addEventListener('submit', (e) => {
                e.preventDefault();
                renderProductGrid(grid, currentParams());
            });
        }
    }

    // Index page sections
    const recent = document.getElementById('recent-products');
    if (recent) {
        renderProductGrid(recent, { limit: 8 });
    }

    const loved = document.getElementById('loved-products');
    if (loved) {
        renderProductGrid(loved, { limit: 8 });
    }

    // Cart page
    const cartContainer = document.getElementById('cart-items');
    if (cartContainer) {
        const checkoutBtn = document.getElementById('checkout-btn');
        const totalEl = document.getElementById('cart-total');
        async function renderCart() {
            const items = Cart.read();
            if (!items.length) {
                cartContainer.innerHTML = '<p>Your cart is empty.</p>';
                totalEl.textContent = '0.00';
                return;
            }
            // Load product details for price display
            const { items: products } = await API.fetchProducts({ limit: 100 });
            const idToProduct = new Map(products.map(p => [String(p._id), p]));
            let total = 0;
            cartContainer.innerHTML = items.map(({ product, quantity }) => {
                const p = idToProduct.get(String(product));
                if (!p) return '';
                const img = (p.images && p.images[0]) || 'img/main.jpg';
                const price = Number(p.price || 0);
                const line = price * quantity;
                total += line;
                return `
                    <div class="cart-row" data-product-id="${p._id}">
                        <img src="${img}" alt="${(p.name || '').replace(/</g, '&lt;')}">
                        <div class="cart-info">
                            <h4>${(p.name || '').replace(/</g, '&lt;')}</h4>
                            <p>${price.toFixed(2)} ETB</p>
                            <input type="number" class="cart-qty" value="${quantity}" min="1">
                            <button type="button" class="remove-item">Remove</button>
                        </div>
                        <div class="cart-line">${line.toFixed(2)} ETB</div>
                    </div>
                `;
            }).join('');
            totalEl.textContent = total.toFixed(2);

            cartContainer.querySelectorAll('.cart-row').forEach(row => {
                const pid = row.getAttribute('data-product-id');
                row.querySelector('.cart-qty').addEventListener('change', (e) => {
                    const val = parseInt(e.target.value || '1', 10);
                    Cart.setQuantity(pid, val);
                    renderCart();
                });
                row.querySelector('.remove-item').addEventListener('click', () => {
                    Cart.remove(pid);
                    renderCart();
                });
            });
        }

        renderCart();
        if (checkoutBtn) {
            checkoutBtn.addEventListener('click', async () => {
                try {
                    const items = Cart.read();
                    if (!items.length) return alert('Cart is empty');
                    await API.placeOrder(items);
                    Cart.clear();
                    alert('Order placed!');
                    renderCart();
                } catch (e) {
                    alert(e.message);
                }
            });
        }
    }

    // Profile page
    const profileContainer = document.getElementById('profile-container');
    const ordersContainer = document.getElementById('orders-container');
    if (profileContainer || ordersContainer) {
        (async () => {
            try {
                const me = await API.me();
                if (profileContainer) {
                    profileContainer.innerHTML = `
                        <h2>${me.firstName} ${me.lastName}</h2>
                        <p>${me.email}</p>
                    `;
                }
                if (ordersContainer) {
                    const orders = await API.myOrders();
                    ordersContainer.innerHTML = orders.map(o => `
                        <div class="order">
                            <h4>Order ${o._id} - ${o.status}</h4>
                            <p>Total: ${Number(o.totalAmount || 0).toFixed(2)} ETB</p>
                        </div>
                    `).join('');
                }
            } catch (e) {
                if (profileContainer) profileContainer.innerHTML = `<p>${e.message}</p>`;
            }
        })();
    }

    // Admin page
    const adminList = document.getElementById('admin-products');
    if (adminList) {
        const form = document.getElementById('admin-create-form');
        const uploadInputs = new Map();

        async function refreshAdminList() {
            adminList.innerHTML = '<p>Loading...</p>';
            try {
                const { items } = await API.fetchProducts({ limit: 200 });
                adminList.innerHTML = items.map(p => `
                    <div class="admin-row" data-id="${p._id}">
                        <strong>${(p.name || '').replace(/</g, '&lt;')}</strong> - ${Number(p.price || 0).toFixed(2)} ETB
                        <button type="button" class="edit">Edit</button>
                        <button type="button" class="delete">Delete</button>
                        <input type="file" class="upload" multiple>
                    </div>
                `).join('');
                adminList.querySelectorAll('.admin-row').forEach(row => {
                    const id = row.getAttribute('data-id');
                    row.querySelector('.delete').addEventListener('click', async () => {
                        if (!confirm('Delete this product?')) return;
                        try { await API.adminDeleteProduct(id); refreshAdminList(); } catch (e) { alert(e.message); }
                    });
                    row.querySelector('.edit').addEventListener('click', async () => {
                        const name = prompt('Name');
                        const price = prompt('Price');
                        const category = prompt('Category');
                        try { await API.adminUpdateProduct(id, { name, price: Number(price), category }); refreshAdminList(); } catch (e) { alert(e.message); }
                    });
                    const input = row.querySelector('.upload');
                    input.addEventListener('change', async () => {
                        const files = input.files;
                        if (!files || !files.length) return;
                        try { await API.adminUploadImages(id, files); alert('Uploaded'); refreshAdminList(); } catch (e) { alert(e.message); }
                    });
                });
            } catch (e) {
                adminList.innerHTML = `<p>${e.message}</p>`;
            }
        }

        if (form) {
            form.addEventListener('submit', async (e) => {
                e.preventDefault();
                const fd = new FormData(form);
                const payload = {
                    name: fd.get('name'),
                    description: fd.get('description'),
                    price: Number(fd.get('price') || 0),
                    category: fd.get('category'),
                    inventoryCount: Number(fd.get('inventoryCount') || 0)
                };
                try {
                    await API.adminCreateProduct(payload);
                    form.reset();
                    refreshAdminList();
                } catch (e2) {
                    alert(e2.message);
                }
            });
        }

        refreshAdminList();
    }
});

