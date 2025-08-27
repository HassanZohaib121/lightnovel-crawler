// Global variables
let statusInterval;
let activeCrawls = [];

// DOM elements
const crawlForm = document.getElementById('crawlForm');
const rangeSelect = document.getElementById('range');
const customRangeGroup = document.getElementById('customRangeGroup');
const customRangeInput = document.getElementById('customRange');
const crawlsList = document.getElementById('crawlsList');

// Initialize the application
document.addEventListener('DOMContentLoaded', function() {
    initializeForm();
    startStatusPolling();
    loadInitialStatus();
});

// Form initialization
function initializeForm() {
    // Handle range selection change
    rangeSelect.addEventListener('change', function() {
        if (this.value === 'custom') {
            customRangeGroup.style.display = 'block';
            customRangeInput.required = true;
        } else {
            customRangeGroup.style.display = 'none';
            customRangeInput.required = false;
        }
    });

    // Handle form submission
    crawlForm.addEventListener('submit', handleFormSubmit);
}

// Handle form submission
async function handleFormSubmit(e) {
    e.preventDefault();
    
    const formData = new FormData(crawlForm);
    const data = {
        url: formData.get('url'),
        range: formData.get('range') === 'custom' ? formData.get('customRange') : formData.get('range'),
        concurrency: parseInt(formData.get('concurrency')),
        delay: formData.get('delay'),
        epub: formData.get('epub') === 'on',
        txt: formData.get('txt') === 'on',
        headless: formData.get('headless') === 'true',
        logLevel: formData.get('logLevel')
    };

    try {
        showToast('Starting crawl...', 'info');
        
        const response = await fetch('/api/crawl', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(data)
        });

        const result = await response.json();
        
        if (result.success) {
            showToast('Crawl started successfully!', 'success');
            resetForm();
            // Refresh status immediately
            await refreshStatus();
        } else {
            showToast(`Failed to start crawl: ${result.error}`, 'error');
        }
    } catch (error) {
        console.error('Error starting crawl:', error);
        showToast('Failed to start crawl. Please try again.', 'error');
    }
}

// Reset form
function resetForm() {
    crawlForm.reset();
    customRangeGroup.style.display = 'none';
    customRangeInput.required = false;
}

// Start status polling
function startStatusPolling() {
    statusInterval = setInterval(refreshStatus, 5000); // Poll every 5 seconds
}

// Load initial status
async function loadInitialStatus() {
    await refreshStatus();
}

// Refresh status
async function refreshStatus() {
    try {
        const response = await fetch('/api/status');
        const status = await response.json();
        
        activeCrawls = status.crawls || [];
        updateCrawlsList();
    } catch (error) {
        console.error('Error refreshing status:', error);
    }
}

// Update crawls list
function updateCrawlsList() {
    if (activeCrawls.length === 0) {
        crawlsList.innerHTML = `
            <div class="no-crawls">
                <i class="fas fa-info-circle"></i>
                <p>No active crawls. Start a new crawl above.</p>
            </div>
        `;
        return;
    }

    crawlsList.innerHTML = activeCrawls.map(crawl => createCrawlItem(crawl)).join('');
}

// Create crawl item HTML
function createCrawlItem(crawl) {
    const startTime = new Date(crawl.startTime).toLocaleString();
    const progressPercent = Math.round(crawl.progress || 0);
    
    return `
        <div class="crawl-item">
            <div class="crawl-header">
                <div class="crawl-url">${crawl.url}</div>
                <span class="crawl-status status-${crawl.status}">${crawl.status}</span>
            </div>
            
            <div class="crawl-progress">
                <div class="progress-bar">
                    <div class="progress-fill" style="width: ${progressPercent}%"></div>
                </div>
                <small>${progressPercent}% complete</small>
            </div>
            
            <div class="crawl-info">
                <div>
                    <span>Started</span>
                    <span>${startTime}</span>
                </div>
                <div>
                    <span>Chapters</span>
                    <span>${crawl.completedChapters || 0} / ${crawl.totalChapters || 0}</span>
                </div>
                <div>
                    <span>Progress</span>
                    <span>${progressPercent}%</span>
                </div>
            </div>
            
            <div class="crawl-actions">
                ${crawl.status === 'running' ? `
                    <button class="btn btn-danger" onclick="stopCrawl('${crawl.id}')">
                        <i class="fas fa-stop"></i> Stop
                    </button>
                ` : ''}
                
                ${crawl.status === 'completed' ? `
                    <button class="btn btn-outline" onclick="openCrawlFolder('${crawl.id}')">
                        <i class="fas fa-folder-open"></i> Open Folder
                    </button>
                ` : ''}
                
                ${crawl.status === 'failed' ? `
                    <button class="btn btn-outline" onclick="retryCrawl('${crawl.id}')">
                        <i class="fas fa-redo"></i> Retry
                    </button>
                ` : ''}
            </div>
        </div>
    `;
}

// Stop crawl
async function stopCrawl(crawlId) {
    if (!confirm('Are you sure you want to stop this crawl?')) {
        return;
    }

    try {
        const response = await fetch(`/api/crawl/${crawlId}`, {
            method: 'DELETE'
        });

        const result = await response.json();
        
        if (result.success) {
            showToast('Crawl stopped successfully', 'success');
            await refreshStatus();
        } else {
            showToast(`Failed to stop crawl: ${result.error}`, 'error');
        }
    } catch (error) {
        console.error('Error stopping crawl:', error);
        showToast('Failed to stop crawl. Please try again.', 'error');
    }
}

// Open crawl folder (placeholder - would need backend implementation)
function openCrawlFolder(crawlId) {
    showToast('Opening folder...', 'info');
    // This would need backend implementation to open the folder
    // For now, just show a toast
}

// Retry crawl (placeholder - would need backend implementation)
function retryCrawl(crawlId) {
    showToast('Retry functionality coming soon...', 'info');
    // This would need backend implementation to retry the crawl
}

// Open downloads folder
function openDownloads() {
    showToast('Opening downloads folder...', 'info');
    // This would need backend implementation to open the folder
    // For now, just show a toast
}

// Show help modal
function showHelp() {
    document.getElementById('helpModal').style.display = 'block';
}

// Close help modal
function closeHelp() {
    document.getElementById('helpModal').style.display = 'none';
}

// Close modal when clicking outside
window.onclick = function(event) {
    const modal = document.getElementById('helpModal');
    if (event.target === modal) {
        modal.style.display = 'none';
    }
}

// Show toast notification
function showToast(message, type = 'info') {
    const toast = document.getElementById('toast');
    toast.textContent = message;
    toast.className = `toast show ${type}`;
    
    // Auto-hide after 3 seconds
    setTimeout(() => {
        toast.classList.remove('show');
    }, 3000);
}

// Utility functions
function formatBytes(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function formatDuration(ms) {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    
    if (hours > 0) {
        return `${hours}h ${minutes % 60}m`;
    } else if (minutes > 0) {
        return `${minutes}m ${seconds % 60}s`;
    } else {
        return `${seconds}s`;
    }
}

// Cleanup on page unload
window.addEventListener('beforeunload', function() {
    if (statusInterval) {
        clearInterval(statusInterval);
    }
});
