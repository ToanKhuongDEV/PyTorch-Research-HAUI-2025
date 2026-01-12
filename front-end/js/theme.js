// js/theme.js

document.addEventListener('DOMContentLoaded', () => {
    const toggleBtn = document.getElementById('themeToggleBtn');
    const icon = toggleBtn.querySelector('i');
    const html = document.documentElement;

    // 1. Kiểm tra LocalStorage
    const savedTheme = localStorage.getItem('theme');
    const systemPrefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;

    // Logic xác định theme ban đầu
    if (savedTheme === 'light') {
        html.setAttribute('data-theme', 'light');
        updateIcon('light');
    } else {
        html.removeAttribute('data-theme'); // Mặc định là Dark
        updateIcon('dark');
    }

    // 2. Sự kiện Click
    toggleBtn.addEventListener('click', () => {
        const currentTheme = html.getAttribute('data-theme');
        
        if (currentTheme === 'light') {
            // Chuyển sang Dark
            html.removeAttribute('data-theme');
            localStorage.setItem('theme', 'dark');
            updateIcon('dark');
        } else {
            // Chuyển sang Light
            html.setAttribute('data-theme', 'light');
            localStorage.setItem('theme', 'light');
            updateIcon('light');
        }
    });

    // Hàm đổi icon mặt trời/mặt trăng
    function updateIcon(theme) {
        if (theme === 'light') {
            icon.className = 'fas fa-moon'; // Hiện trăng (để bấm về tối)
        } else {
            icon.className = 'fas fa-sun'; // Hiện trời (để bấm về sáng)
        }
    }
});