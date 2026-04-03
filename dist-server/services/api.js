const API_BASE_URL = '/api';
export const api = {
    async checkHealth() {
        const response = await fetch(`${API_BASE_URL}/health`);
        return response.json();
    },
    async testDatabaseConnection() {
        const response = await fetch(`${API_BASE_URL}/test-db`);
        return response.json();
    },
    // Example for future implementation
    async getSuppliers() {
        const response = await fetch(`${API_BASE_URL}/suppliers`);
        if (!response.ok)
            throw new Error('Failed to fetch suppliers');
        return response.json();
    },
    async createSupplier(supplier) {
        const response = await fetch(`${API_BASE_URL}/suppliers`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(supplier),
        });
        if (!response.ok)
            throw new Error('Failed to create supplier');
        return response.json();
    }
};
