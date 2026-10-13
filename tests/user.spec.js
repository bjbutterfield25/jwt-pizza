import { test, expect } from 'playwright-test-coverage';
import { Role } from '../src/service/pizzaService';

async function mockUserApi(page) {
    let loggedInUser = null;
    const users = {
        'd@jwt.com': { id: '3', name: 'Kai Chen', email: 'd@jwt.com', password: 'a', roles: [{ role: Role.Diner }] },
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
    await page.getByRole('link', { name: 'Login' }).click();

    await page.getByRole('textbox', { name: 'Email address' }).fill(email);
    await page.getByRole('textbox', { name: 'Password' }).fill('diner');
    await page.getByRole('button', { name: 'Login' }).click();

    await page.getByRole('link', { name: 'pd' }).click();

    await expect(page.getByRole('main')).toContainText('pizza dinerx');
});