import { test, expect } from 'playwright-test-coverage';
import { Role } from '../src/service/pizzaService';

async function mockUserApi(page) {
    let loggedInUser = null;
    const users = {
        'd@jwt.com': { id: '3', name: 'Kai Chen', email: 'd@jwt.com', password: 'a', roles: [{ role: Role.Diner }] },
        'admin@jwt.com': { id: '99', name: 'Admin User', email: 'admin@jwt.com', password: 'a', roles: [{ role: Role.Admin }] },
        'franchise@jwt.com': { id: '12', name: 'Franchise Owner', email: 'franchise@jwt.com', password: 'a', roles: [{ role: Role.Franchisee, objectId: '2' }] },
    };

    await page.route('*/**/api/auth', async (route) => {
        const request = route.request();
        const method = request.method();
        const payload = request.postDataJSON?.() || {};

        if (method === 'DELETE') {
            loggedInUser = null;
            await route.fulfill({ json: {} });
            return;
        }

        if (method === 'POST') {
            const newUser = {
                id: String(Date.now()),
                name: payload.name,
                email: payload.email,
                password: payload.password,
                roles: [{ role: Role.Diner }],
            };
            users[payload.email] = newUser;
            loggedInUser = newUser;
            await route.fulfill({ json: { user: newUser, token: 'mock-token' } });
            return;
        }

        const user = users[payload.email];
        if (!user || user.password !== payload.password) {
            await route.fulfill({ status: 401, json: { message: 'Unauthorized' } });
            return;
        }

        loggedInUser = user;
        await route.fulfill({ json: { user, token: 'mock-token' } });
    });

    await page.route('*/**/api/user/me', async (route) => {
        expect(route.request().method()).toBe('GET');
        await route.fulfill({ json: loggedInUser });
    });

    await page.route('*/**/api/user/**', async (route) => {
        if (route.request().method() !== 'PUT') {
            await route.fulfill({ json: {} });
            return;
        }

        const updatedUser = route.request().postDataJSON();
        const previousUser = loggedInUser;
        const nextUser = {
            ...previousUser,
            ...updatedUser,
            password: updatedUser.password || previousUser.password,
            roles: previousUser.roles,
        };

        if (previousUser.email !== nextUser.email) {
            delete users[previousUser.email];
        }

        users[nextUser.email] = nextUser;
        loggedInUser = nextUser;
        await route.fulfill({ json: { user: nextUser, token: 'mock-token' } });
    });

    await page.route('*/**/api/order', async (route) => {
        if (route.request().method() === 'GET') {
            await route.fulfill({ json: { orders: [] } });
            return;
        }

        await route.fulfill({ json: { order: route.request().postDataJSON(), jwt: 'mock-jwt' } });
    });

    await page.goto('/');
}

async function login(page, email, password) {
    await page.getByRole('link', { name: 'Login' }).click();
    await page.getByRole('textbox', { name: 'Email address' }).fill(email);
    await page.getByRole('textbox', { name: 'Password' }).fill(password);
    await page.getByRole('button', { name: 'Login' }).click();
}

async function openProfileEditor(page) {
    await page.goto('/diner-dashboard');
    await page.getByRole('button', { name: 'Edit' }).click();
    await expect(page.locator('#hs-jwt-modal')).toBeVisible();
}

test('updateUser', async ({ page }) => {
    await mockUserApi(page);

    const email = `user${Math.floor(Math.random() * 10000)}@jwt.com`;
    await page.getByRole('link', { name: 'Register' }).click();
    await page.getByRole('textbox', { name: 'Full name' }).fill('pizza diner');
    await page.getByRole('textbox', { name: 'Email address' }).fill(email);
    await page.getByRole('textbox', { name: 'Password' }).fill('diner');
    await page.getByRole('button', { name: 'Register' }).click();

    await page.getByRole('link', { name: 'pd' }).click();

    await expect(page.getByRole('main')).toContainText('pizza diner');
    await page.getByRole('button', { name: 'Edit' }).click();
    await expect(page.locator('h3')).toContainText('Edit user');
    await page.getByRole('button', { name: 'Update' }).click();

    await page.waitForSelector('[role="dialog"].hidden', { state: 'attached' });

    await expect(page.getByRole('main')).toContainText('pizza diner');
    await page.getByRole('button', { name: 'Edit' }).click();
    await expect(page.locator('h3')).toContainText('Edit user');
    await page.getByRole('textbox').first().fill('pizza dinerx');
    await page.getByRole('button', { name: 'Update' }).click();

    await page.waitForSelector('[role="dialog"].hidden', { state: 'attached' });

    await expect(page.getByRole('main')).toContainText('pizza dinerx');
    await page.getByRole('link', { name: 'Logout' }).click();
    await login(page, email, 'diner');

    await page.getByRole('link', { name: 'pd' }).click();
    await expect(page.getByRole('main')).toContainText('pizza dinerx');
});

test('updateUser can change a diner email address', async ({ page }) => {
    await mockUserApi(page);
    await login(page, 'd@jwt.com', 'a');
    await openProfileEditor(page);

    const inputs = page.locator('#hs-jwt-modal input');
    await inputs.nth(0).fill('Cara Chen');
    await inputs.nth(1).fill('cara@jwt.com');
    await inputs.nth(2).fill('');
    await page.getByRole('button', { name: 'Update' }).click();

    await expect(page.getByText('Cara Chen')).toBeVisible();
    await expect(page.getByText('cara@jwt.com')).toBeVisible();

    await page.getByRole('link', { name: 'Logout' }).click();
    await login(page, 'cara@jwt.com', 'a');
    await expect(page.getByRole('link', { name: 'CC' })).toBeVisible();
});

test('updateUser can change a diner password', async ({ page }) => {
    await mockUserApi(page);
    await login(page, 'd@jwt.com', 'a');
    await openProfileEditor(page);

    const inputs = page.locator('#hs-jwt-modal input');
    await inputs.nth(0).fill('Kai Chen');
    await inputs.nth(1).fill('d@jwt.com');
    await inputs.nth(2).fill('new-secret');
    await page.getByRole('button', { name: 'Update' }).click();

    await expect(page.getByText('Kai Chen')).toBeVisible();
    await page.getByRole('link', { name: 'Logout' }).click();
    await login(page, 'd@jwt.com', 'new-secret');
    await expect(page.getByRole('link', { name: 'KC' })).toBeVisible();
});

test('updateUser preserves admin role information when editing profile', async ({ page }) => {
    await mockUserApi(page);
    await login(page, 'admin@jwt.com', 'a');
    await openProfileEditor(page);

    const inputs = page.locator('#hs-jwt-modal input');
    await inputs.nth(0).fill('Ariana Admin');
    await inputs.nth(1).fill('admin-updated@jwt.com');
    await inputs.nth(2).fill('new-admin-pass');
    await page.getByRole('button', { name: 'Update' }).click();

    await expect(page.getByText('Ariana Admin')).toBeVisible();
    await expect(page.getByText('admin-updated@jwt.com')).toBeVisible();

    await page.getByRole('link', { name: 'Logout' }).click();
    await login(page, 'admin-updated@jwt.com', 'new-admin-pass');
    await expect(page.getByRole('link', { name: 'AA' })).toBeVisible();
});

test('updateUser preserves franchisee role information when editing profile', async ({ page }) => {
    await mockUserApi(page);
    await login(page, 'franchise@jwt.com', 'a');
    await openProfileEditor(page);

    const inputs = page.locator('#hs-jwt-modal input');
    await inputs.nth(0).fill('Franchise Owner Updated');
    await inputs.nth(1).fill('franchise-updated@jwt.com');
    await inputs.nth(2).fill('new-franchise-pass');
    await page.getByRole('button', { name: 'Update' }).click();

    await expect(page.getByText('Franchise Owner Updated')).toBeVisible();
    await expect(page.getByText('franchise-updated@jwt.com')).toBeVisible();
});

test('listUsers returns the current set of users', async ({ page }) => {
    await mockUserApi(page);
    await login(page, 'admin@jwt.com', 'a');

    await page.route('*/**/api/user*', async (route) => {
        const request = route.request();
        if (request.method() !== 'GET') {
            await route.fulfill({ json: {} });
            return;
        }

        const users = [
            { id: '99', name: 'Admin User', email: 'admin@jwt.com', roles: [{ role: Role.Admin }] },
            { id: '3', name: 'Kai Chen', email: 'd@jwt.com', roles: [{ role: Role.Diner }] },
            { id: '12', name: 'Franchise Owner', email: 'franchise@jwt.com', roles: [{ role: Role.Franchisee, objectId: '2' }] },
        ];

        await route.fulfill({
            json: {
                users,
                page: 0,
                limit: 10,
                total: users.length,
            },
        });
    });

    const response = await page.evaluate(async () => {
        const r = await fetch('/api/user');
        return r.json();
    });

    expect(response.total).toBe(3);
    expect(response.users.map((user) => user.email).sort()).toEqual(['admin@jwt.com', 'd@jwt.com', 'franchise@jwt.com'].sort());
});

test('listUsers paginates results by page and limit', async ({ page }) => {
    await mockUserApi(page);
    await login(page, 'admin@jwt.com', 'a');

    const users = [
        { id: '99', name: 'Admin User', email: 'admin@jwt.com', roles: [{ role: Role.Admin }] },
        { id: '3', name: 'Kai Chen', email: 'd@jwt.com', roles: [{ role: Role.Diner }] },
        { id: '12', name: 'Franchise Owner', email: 'franchise@jwt.com', roles: [{ role: Role.Franchisee, objectId: '2' }] },
    ];

    await page.route('*/**/api/user*', async (route) => {
        const request = route.request();
        if (request.method() !== 'GET') {
            await route.fulfill({ json: {} });
            return;
        }

        const url = new URL(request.url());
        const pageNumber = Number(url.searchParams.get('page') || '0');
        const pageSize = Number(url.searchParams.get('limit') || '10');
        const start = pageNumber * pageSize;
        const pagedUsers = users.slice(start, start + pageSize);

        await route.fulfill({
            json: {
                users: pagedUsers,
                page: pageNumber,
                limit: pageSize,
                total: users.length,
            },
        });
    });

    const firstPage = await page.evaluate(async () => {
        const r = await fetch('/api/user?page=0&limit=2');
        return r.json();
    });

    const secondPage = await page.evaluate(async () => {
        const r = await fetch('/api/user?page=1&limit=2');
        return r.json();
    });

    expect(firstPage.page).toBe(0);
    expect(firstPage.limit).toBe(2);
    expect(firstPage.users).toHaveLength(2);
    expect(secondPage.page).toBe(1);
    expect(secondPage.limit).toBe(2);
    expect(secondPage.users).toHaveLength(1);
});