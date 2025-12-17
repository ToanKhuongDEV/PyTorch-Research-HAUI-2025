// js/dashboard.js

const API_URL = "http://127.0.0.1:8000/statistics";

let chartTrend = null;
let chartPie = null;
let currentData = [];

document.addEventListener("DOMContentLoaded", () => {
    loadData();
    document.getElementById('refreshBtn').addEventListener('click', loadData);
    
    // Tự động làm mới mỗi 10 giây
    setInterval(loadData, 10000);
});

async function loadData() {
    try {
        const response = await fetch(API_URL);
        if (!response.ok) throw new Error("Lỗi kết nối API");
        
        const data = await response.json();
        currentData = data; // Lưu để dùng cho export
        
        updateKPIs(data);
        renderTable(data);
        renderCharts(data);
        
    } catch (error) {
        console.error("Lỗi tải dữ liệu:", error);
    }
}

function updateKPIs(data) {
    if (data.length === 0) return;

    const total = data.length;
    const ngCount = data.filter(item => item.status === "NG").length;
    const okCount = total - ngCount;
    const defectRate = ((ngCount / total) * 100).toFixed(1);
    
    // Tính thời gian xử lý trung bình
    const totalTime = data.reduce((sum, item) => sum + item.process_time, 0);
    const avgTime = (totalTime / total).toFixed(0);

    // Update DOM
    animateValue("kpi-total", parseInt(document.getElementById("kpi-total").innerText), total, 500);
    document.getElementById("kpi-rate").innerText = `${defectRate}%`;
    document.getElementById("kpi-ok").innerText = okCount;
    document.getElementById("kpi-time").innerText = `${avgTime} ms`;
}

function renderTable(data) {
    const tbody = document.getElementById("tableBody");
    tbody.innerHTML = "";
    
    // Lấy 10 dòng mới nhất
    const recentData = data.slice(0, 10);

    recentData.forEach(row => {
        const tr = document.createElement("tr");
        const statusBadge = row.status === "OK" 
            ? `<span class="badge badge-success">OK</span>` 
            : `<span class="badge badge-destructive">NG</span>`;
            
        tr.innerHTML = `
            <td>#${row.id}</td>
            <td>${row.timestamp}</td>
            <td>${statusBadge}</td>
            <td>${row.defect_type}</td>
            <td>${(row.confidence * 100).toFixed(1)}%</td>
            <td>${row.process_time} ms</td>
        `;
        tbody.appendChild(tr);
    });
}

function renderCharts(data) {
    // 1. Xử lý dữ liệu cho biểu đồ PIE (Loại lỗi)
    const defects = data.filter(d => d.status === "NG");
    const defectCounts = {};
    defects.forEach(d => {
        defectCounts[d.defect_type] = (defectCounts[d.defect_type] || 0) + 1;
    });

    const pieCtx = document.getElementById('pieChart').getContext('2d');
    if (chartPie) chartPie.destroy(); // Xóa biểu đồ cũ nếu có
    
    chartPie = new Chart(pieCtx, {
        type: 'doughnut',
        data: {
            labels: Object.keys(defectCounts).length ? Object.keys(defectCounts) : ['Không có lỗi'],
            datasets: [{
                data: Object.keys(defectCounts).length ? Object.values(defectCounts) : [1],
                backgroundColor: ['#e74c3c', '#f1c40f', '#e67e22', '#9b59b6'],
            }]
        },
        options: { responsive: true, maintainAspectRatio: false }
    });

    // 2. Xử lý dữ liệu cho biểu đồ LINE (Xu hướng theo thời gian - giả lập theo phút/giờ)
    // Gom nhóm dữ liệu theo giờ hoặc phút (ở đây lấy 10 điểm gần nhất làm mẫu)
    const labels = data.slice(0, 20).map(d => d.timestamp.split(' ')[1]).reverse(); // Lấy giờ
    const confidences = data.slice(0, 20).map(d => d.status === 'NG' ? 1 : 0).reverse(); // 1 là lỗi, 0 là OK

    const lineCtx = document.getElementById('trendChart').getContext('2d');
    if (chartTrend) chartTrend.destroy();

    chartTrend = new Chart(lineCtx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                label: 'Phát hiện lỗi (1=NG, 0=OK)',
                data: confidences,
                borderColor: '#6366f1',
                tension: 0.4,
                fill: true,
                backgroundColor: 'rgba(99, 102, 241, 0.1)'
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                y: { beginAtZero: true, max: 1.2, ticks: { stepSize: 1 } }
            },
            maintainAspectRatio: false,
        }
    });
}

// Hàm xuất CSV
function exportToCSV() {
    if (!currentData.length) {
        alert("Chưa có dữ liệu để xuất!");
        return;
    }
    
    let csvContent = "data:text/csv;charset=utf-8,";
    csvContent += "ID,Time,Status,Defect Type,Confidence,Process Time (ms)\n";

    currentData.forEach(row => {
        csvContent += `${row.id},${row.timestamp},${row.status},${row.defect_type},${row.confidence},${row.process_time}\n`;
    });

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `report_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
}

// Hiệu ứng nhảy số
function animateValue(id, start, end, duration) {
    if (start === end) return;
    const range = end - start;
    let current = start;
    const increment = end > start ? 1 : -1;
    const stepTime = Math.abs(Math.floor(duration / range));
    const obj = document.getElementById(id);
    const timer = setInterval(function() {
        current += increment;
        obj.innerHTML = current;
        if (current == end) {
            clearInterval(timer);
        }
    }, stepTime);
}