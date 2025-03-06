class MemosAPI {
    constructor(instance = 'https://memos.ee') {
        this.instance = instance;
    }

    async getMemos(pageSize = 10, pageToken = '') {
        try {
            let url = `${this.instance}/api/v1/memos?pageSize=${pageSize}&parent=users/1`;
            if (pageToken) {
                url += `&pageToken=${pageToken}`;
            }
            const response = await fetch(url);
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            return await response.json();
        } catch (error) {
            console.error('获取Memos失败:', error);
            throw error;
        }
    }

    async getUserInfo(userId) {
        const response = await fetch(`${this.instance}/api/v1/users/${userId}`);
        if (!response.ok) throw new Error('获取用户信息失败');
        return await response.json();
    }
}
