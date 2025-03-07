const api = new MemosAPI();

// 初始化lightbox
lightbox.option({
    'resizeDuration': 200,
    'wrapAround': true,
    'albumLabel': '图片 %1 / %2'
});

// 初始化markdown解析器
const md = window.markdownit({
    breaks: true,
    linkify: true
});

function formatDate(dateString) {
    const date = new Date(dateString);
    return date.toLocaleString('zh-CN', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
    });
}

function extractMarkdownImages(content) {
    const imageRegex = /!\[([^\]]*)\]\(([^)]+)\)/g;
    const images = [];
    let match;
    
    while ((match = imageRegex.exec(content)) !== null) {
        images.push({
            alt: match[1],
            url: match[2],
            fullMatch: match[0]
        });
    }
    
    return images;
}

async function renderMemo(memo) {
    try {
        const memoEl = document.createElement('div');
        memoEl.className = 'memo';
        
        // 提取和处理图片（优化性能）
        const mdImages = extractMarkdownImages(memo.content);
        let content = memo.content;
        
        // 使用正则一次性替换所有图片
        content = content.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '');
        
        // 异步获取用户信息
        const userId = memo.creator.split('/')[1];
        const userInfo = await api.getUserInfo(userId).catch(err => ({
            nickname: '未知用户',
            description: '',
            avatarUrl: '/default-avatar.png'
        }));
        const avatarUrl = `${api.instance}${userInfo.avatarUrl}`;
        const tags = memo.tags || [];
        const tagsHtml = tags.map(tag => 
            `<span class="tag">${tag}</span>`
        ).join('');
        
        // 移除标签
        tags.forEach(tag => {
            content = content.replace(`#${tag}`, '');
        });
        
        // 渲染Markdown内容并处理链接
        let renderedContent = md.render(content.trim());
        renderedContent = renderedContent.replace(
            /<a\s+href="([^"]+)">/g, 
            '<a href="$1" target="_blank" style="display: inline-block; width: 100%;">'
        );
        
        // 创建图片网格
        const imageGrid = document.createElement('div');
        imageGrid.className = 'image-grid';
        imageGrid.style.cssText = `
            display: grid;
            grid-template-columns: repeat(3, 1fr);
            gap: 8px;
            margin-top: 10px;
        `;
        
        // 合并Markdown图片和资源列表图片
        const allImages = [...mdImages];
        const downloadLinks = [];
        
        // 处理资源列表 - 修改 resourceList 为 resources
        if (memo.resources && memo.resources.length > 0) {
            console.log('Processing resources for memo:', memo.id, memo.resources);
            
            memo.resources.forEach(resource => {
                const baseUrl = api.instance.endsWith('/') ? api.instance.slice(0, -1) : api.instance;
                const resourceUrl = `${baseUrl}/file/${resource.name}/${resource.filename}`;
                
                console.log('Resource URL:', resourceUrl);
                
                if (resource.type.startsWith('image/')) {
                    allImages.push({
                        url: resourceUrl,
                        alt: resource.filename || '图片'
                    });
                    console.log('Added image to grid:', resourceUrl);
                } else {
                    downloadLinks.push(`
                        <a href="${resourceUrl}" 
                           target="_blank" 
                           class="resource-download-link"
                           download="${resource.filename}">
                            📎 下载 ${resource.filename}
                        </a>
                    `);
                }
            });
        }

        // 使用DocumentFragment提高性能，添加所有图片
        if (allImages.length > 0) {
            console.log('Creating image containers for:', allImages.length, 'images'); // 调试日志
            const fragment = document.createDocumentFragment();
            allImages.forEach(img => {
                const imgContainer = createImageContainer(img, memo.id);
                fragment.appendChild(imgContainer);
            });
            imageGrid.appendChild(fragment);
        }

        memoEl.innerHTML = `
            <div class="memo-header">
                <img class="avatar" src="${avatarUrl}" alt="avatar">
                <div class="user-info">
                    <div class="user-name">${userInfo.nickname}</div>
                    <div class="user-description">${userInfo.description || ''}</div>
                    <div class="memo-time">${formatDate(memo.createTime)}</div>
                </div>
            </div>
            <div class="memo-content-wrapper">
                <div class="tags-container">${tagsHtml}</div>
                <div class="memo-content markdown-body">${renderedContent}</div>
                ${downloadLinks.length > 0 ? 
                    `<div class="resource-downloads">${downloadLinks.join('')}</div>` 
                    : ''
                }
            </div>
        `;

        // 确保在设置innerHTML后再添加图片网格
        if (allImages.length > 0) {
            console.log('Appending image grid with', allImages.length, 'images'); // 调试日志
            const contentWrapper = memoEl.querySelector('.memo-content-wrapper');
            if (contentWrapper) {
                contentWrapper.appendChild(imageGrid);
            } else {
                console.error('Content wrapper not found'); // 调试日志
            }
        }

        return memoEl;
        
    } catch (error) {
        console.error('渲染memo失败:', error, memo);
        return createErrorMemoElement();
    }
}

// 新增：创建图片容器的辅助函数
function createImageContainer(img, memoId) {
    const imgContainer = document.createElement('div');
    imgContainer.style.cssText = `
        aspect-ratio: 1;
        overflow: hidden;
    `;
    
    const link = document.createElement('a');
    link.href = img.url;
    link.setAttribute('data-lightbox', `memo-${memoId}`);
    link.setAttribute('data-title', img.alt || '');
    
    const imgEl = document.createElement('img');
    imgEl.src = img.url;
    imgEl.alt = img.alt || '图片';
    imgEl.style.cssText = `
        width: 100%;
        height: 100%;
        object-fit: cover;
    `;
    imgEl.loading = 'lazy';
    
    link.appendChild(imgEl);
    imgContainer.appendChild(link);
    return imgContainer;
}

// 新增：创建错误提示元素的辅助函数
function createErrorMemoElement() {
    const errorEl = document.createElement('div');
    errorEl.className = 'memo error';
    errorEl.innerHTML = '<p>加载失败，请刷新重试</p>';
    return errorEl;
}

let currentPageToken = '';

async function loadMemos(isLoadMore = false) {
    const memosContainer = document.getElementById('memos');
    const loadMoreBtn = document.getElementById('load-more');
    
    if (!memosContainer) {
        console.error('未找到memos容器元素');
        return;
    }
    
    if (!isLoadMore) {
        memosContainer.innerHTML = '<div class="loading">加载中...</div>';
        currentPageToken = '';
    } else if (loadMoreBtn) {
        loadMoreBtn.textContent = '加载中...';
        loadMoreBtn.disabled = true;
    }
    
    try {
        const response = await api.getMemos(10, currentPageToken);
        
        if (!isLoadMore) {
            memosContainer.innerHTML = '';
        }
        
        // 使用 DocumentFragment 批量处理所有 memo
        const fragment = document.createDocumentFragment();
        
        // 并行处理所有 memo 的渲染
        const memoPromises = response.memos.map(memo => renderMemo(memo));
        const memoElements = await Promise.all(memoPromises);
        
        // 将所有渲染好的元素添加到 fragment
        memoElements.forEach(memoEl => {
            fragment.appendChild(memoEl);
        });
        
        // 一次性将所有元素添加到容器中
        memosContainer.appendChild(fragment);
        
        // 更新页面令牌
        currentPageToken = response.nextPageToken || '';
        
        // 更新加载更多按钮状态
        if (loadMoreBtn) {
            if (currentPageToken) {
                loadMoreBtn.style.display = 'block';
                loadMoreBtn.textContent = '加载更多';
                loadMoreBtn.disabled = false;
            } else {
                loadMoreBtn.style.display = 'none';
            }
        }
        
    } catch (error) {
        console.error('加载备忘录失败:', error);
        if (memosContainer) {
            memosContainer.innerHTML = '<div class="error">加载失败，请稍后重试</div>';
        }
        if (loadMoreBtn) {
            loadMoreBtn.textContent = '加载失败，点击重试';
            loadMoreBtn.disabled = false;
        }
    }
}

// 移除重复的 DOMContentLoaded 事件监听器，合并为一个
document.addEventListener('DOMContentLoaded', () => {
    // 确保jQuery和lightbox都已加载
    if (typeof jQuery !== 'undefined' && typeof lightbox !== 'undefined') {
        lightbox.option({
            'resizeDuration': 200,
            'wrapAround': true,
            'albumLabel': '图片 %1 / %2'
        });
    }
    
    const memosContainer = document.getElementById('memos');
    
    // 创建一个包装容器来包含memos列表和加载更多按钮
    const memosWrapper = document.createElement('div');
    memosWrapper.className = 'memos-wrapper';
    
    // 将原有memos容器的内容移到wrapper中
    memosContainer.parentNode.insertBefore(memosWrapper, memosContainer);
    memosWrapper.appendChild(memosContainer);
    
    // 添加加载更多按钮到wrapper中
    const loadMoreBtn = document.createElement('button');
    loadMoreBtn.id = 'load-more';
    loadMoreBtn.className = 'load-more-btn';
    loadMoreBtn.textContent = '加载更多';
    memosWrapper.appendChild(loadMoreBtn);
    
    // 添加防抖处理
    let loadMoreTimeout;
    loadMoreBtn.addEventListener('click', () => {
        if (loadMoreTimeout) clearTimeout(loadMoreTimeout);
        loadMoreTimeout = setTimeout(() => loadMemos(true), 300);
    });
    
    // 初始加载
    loadMemos();
});