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
    const memoEl = document.createElement('div');
    memoEl.className = 'memo';
    
    // 提取Markdown中的图片
    const mdImages = extractMarkdownImages(memo.content);
    
    // 从内容中移除图片
    let content = memo.content;
    mdImages.forEach(img => {
        content = content.replace(img.fullMatch, '');
    });
    
    // 处理其他部分
    const userId = memo.creator.split('/')[1];
    const userInfo = await api.getUserInfo(userId);
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
    if (memo.resourceList) {
        const resourceImages = memo.resourceList
            .filter(resource => resource.type.startsWith('image/'))
            .map(resource => ({
                url: resource.externalLink,
                alt: resource.name || '图片'
            }));
        allImages.push(...resourceImages);
    }
    
    // 添加所有图片到网格
    allImages.forEach(img => {
        const imgContainer = document.createElement('div');
        imgContainer.style.cssText = `
            aspect-ratio: 1;
            overflow: hidden;
        `;
        
        const link = document.createElement('a');
        link.href = img.url;
        link.setAttribute('data-lightbox', `memo-${memo.id}`);
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
        imageGrid.appendChild(imgContainer);
    });
    
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
        </div>
    `;
    
    // 添加图片网格到memo元素
    if (allImages.length > 0) {
        memoEl.querySelector('.memo-content-wrapper').appendChild(imageGrid);
    }
    
    return memoEl;
}

function collectImages(memo) {
    const gallery = document.createElement('div');
    gallery.className = 'image-gallery';
    
    if (!memo.resourceList || !Array.isArray(memo.resourceList)) {
        return gallery;
    }
    
    const imageResources = memo.resourceList.filter(resource => 
        resource.type.startsWith('image/'));
        
    imageResources.forEach(resource => {
        if (resource.externalLink) {
            const imgContainer = document.createElement('div');
            imgContainer.className = 'image-container';
            
            const link = document.createElement('a');
            link.href = resource.externalLink;
            link.setAttribute('data-lightbox', `memo-${memo.id}`);
            link.setAttribute('data-title', resource.name || '');
            
            const img = document.createElement('img');
            img.src = resource.externalLink;
            img.alt = resource.name || '图片';
            img.loading = 'lazy';  // 添加延迟加载
            
            link.appendChild(img);
            imgContainer.appendChild(link);
            gallery.appendChild(imgContainer);
        }
    });

    return gallery;
}

let currentPageToken = '';

async function loadMemos(isLoadMore = false) {
    const container = document.getElementById('memos-container');
    const loadMoreBtn = document.getElementById('load-more');
    
    if (!container) {
        console.error('未找到memos容器元素');
        return;
    }
    
    if (!isLoadMore) {
        container.innerHTML = '<div class="loading">加载中...</div>';
        currentPageToken = '';
    } else if (loadMoreBtn) {
        loadMoreBtn.textContent = '加载中...';
        loadMoreBtn.disabled = true;
    }
    
    try {
        const response = await api.getMemos(10, currentPageToken);
        
        if (!isLoadMore) {
            container.innerHTML = '';
            collectImages(response.memos);
        }
        
        for (const memo of response.memos) {
            const memoEl = await renderMemo(memo);
            container.appendChild(memoEl);
        }
        
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
        if (container) {
            container.innerHTML = '<div class="error">加载失败，请稍后重试</div>';
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
    
    const container = document.getElementById('memos-container');
    
    // 添加加载更多按钮
    const loadMoreBtn = document.createElement('button');
    loadMoreBtn.id = 'load-more';
    loadMoreBtn.className = 'load-more-btn';
    loadMoreBtn.textContent = '加载更多';
    document.body.appendChild(loadMoreBtn);
    
    // 绑定加载更多事件
    loadMoreBtn.addEventListener('click', () => loadMemos(true));
    
    // 初始加载
    loadMemos();
});