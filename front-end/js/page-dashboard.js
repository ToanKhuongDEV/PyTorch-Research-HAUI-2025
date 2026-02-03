// js/page-dashboard.js

const API_URL = "http://127.0.0.1:8000/statistics";

let chartTrend = null;
let chartPie = null;
let allData = []; 

document.addEventListener("DOMContentLoaded", () => {
    // Gắn sự kiện
    document.getElementById('refreshBtn').addEventListener('click', loadData);
    document.getElementById('timeFilter').addEventListener('change', applyFilterAndRender);
    document.getElementById('exportBtn').addEventListener('click', exportToCSV);
    
    loadData();
    setInterval(loadData, 10000); // Auto refresh 10s
});

async function loadData() {
    try {
        const response = await fetch(API_URL);
        if (!response.ok) throw new Error("Lỗi kết nối API");
        
        const data = await response.json();
        allData = data; 
        applyFilterAndRender();
        
    } catch (error) {
        console.error("Lỗi tải dữ liệu:", error);
    }
}

// 1. Hàm lọc dữ liệu theo thời gian (Hôm nay, Tuần, Tháng...)
function filterDataByTime(data, filterType) {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    return data.filter(item => {
        const itemDate = new Date(item.timestamp);
        switch (filterType) {
            case 'today':
                return itemDate >= today;
            case 'week':
                const sevenDaysAgo = new Date(today);
                sevenDaysAgo.setDate(today.getDate() - 7);
                return itemDate >= sevenDaysAgo;
            case 'month':
                return itemDate.getMonth() === now.getMonth() && itemDate.getFullYear() === now.getFullYear();
            case 'all':
            default:
                return true;
        }
    });
}

// 2. [MỚI] Hàm gom nhóm dữ liệu để vẽ biểu đồ cột
// - Nếu xem 'Hôm nay' -> Gom theo Giờ (07:00, 08:00...)
// - Nếu xem Tuần/Tháng -> Gom theo Ngày (20/10, 21/10...)
function aggregateChartData(data, filterType) {
    const groups = {}; // Object để lưu đếm: { "10:00": {ok: 5, ng: 2}, ... }

    data.forEach(item => {
        const date = new Date(item.timestamp);
        let key;

        if (filterType === 'today') {
            // Lấy giờ: "14:00"
            key = `${date.getHours().toString().padStart(2, '0')}:00`;
        } else {
            // Lấy ngày: "25/10"
            key = `${date.getDate().toString().padStart(2, '0')}/${(date.getMonth() + 1).toString().padStart(2, '0')}`;
        }

        if (!groups[key]) groups[key] = { ok: 0, ng: 0 };
        
        if (item.status === 'OK') groups[key].ok++;
        else groups[key].ng++;
    });

    // Sắp xếp các key theo thứ tự thời gian tăng dần
    const sortedKeys = Object.keys(groups).sort((a, b) => {
        if (filterType === 'today') return parseInt(a) - parseInt(b);
        // Sắp xếp ngày đơn giản (giả sử cùng năm)
        const [d1, m1] = a.split('/').map(Number);
        const [d2, m2] = b.split('/').map(Number);
        return (m1 * 31 + d1) - (m2 * 31 + d2); 
    });

    return {
        labels: sortedKeys,
        okData: sortedKeys.map(k => groups[k].ok),
        ngData: sortedKeys.map(k => groups[k].ng)
    };
}

function applyFilterAndRender() {
    const filterType = document.getElementById('timeFilter').value;
    const filteredData = filterDataByTime(allData, filterType);

    updateKPIs(filteredData);
    renderTable(filteredData);
    renderCharts(filteredData, filterType);
}

function updateKPIs(data) {
    if (data.length === 0) {
        document.getElementById("kpi-total").innerText = "0";
        document.getElementById("kpi-rate").innerText = "0%";
        document.getElementById("kpi-ok").innerText = "0";
        document.getElementById("kpi-time").innerText = "0 ms";
        return;
    }

    const total = data.length;
    const ngCount = data.filter(item => item.status === "NG").length;
    const okCount = total - ngCount;
    const defectRate = ((ngCount / total) * 100).toFixed(1);
    const totalTime = data.reduce((sum, item) => sum + item.process_time, 0);
    const avgTime = (totalTime / total).toFixed(0);

    document.getElementById("kpi-total").innerText = total;
    document.getElementById("kpi-rate").innerText = `${defectRate}%`;
    document.getElementById("kpi-ok").innerText = okCount;
    document.getElementById("kpi-time").innerText = `${avgTime} ms`;
}

function renderTable(data) {
    const tbody = document.getElementById("tableBody");
    tbody.innerHTML = "";
    const recentData = data.slice(0, 20); // 20 dòng mới nhất

    if (recentData.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; padding: 20px;">Không có dữ liệu</td></tr>`;
        return;
    }

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

// [CẬP NHẬT] Hàm vẽ biểu đồ với Bar Chart và dữ liệu tổng hợp
function renderCharts(data, filterType) {
    // 1. Biểu đồ Tròn (Giữ nguyên)
    const defects = data.filter(d => d.status === "NG");
    const defectCounts = {};
    if (defects.length > 0) {
        defects.forEach(d => defectCounts[d.defect_type] = (defectCounts[d.defect_type] || 0) + 1);
    }

    const pieCtx = document.getElementById('pieChart').getContext('2d');
    if (chartPie) chartPie.destroy();
    
    chartPie = new Chart(pieCtx, {
        type: 'doughnut',
        data: {
            labels: Object.keys(defectCounts).length ? Object.keys(defectCounts) : ['Không có lỗi'],
            datasets: [{
                data: Object.keys(defectCounts).length ? Object.values(defectCounts) : [1],
                backgroundColor: Object.keys(defectCounts).length ? ['#e74c3c', '#f1c40f', '#e67e22', '#9b59b6'] : ['#2d333b'],
                borderWidth: 0
            }]
        },
        options: { 
            responsive: true, 
            maintainAspectRatio: false,
            plugins: { legend: { position: 'right', labels: { color: '#94a3b8' } } }
        }
    });

    // 2. Biểu đồ Cột (Trend Chart) - Đã sửa thành Bar Chart
    const { labels, okData, ngData } = aggregateChartData(data, filterType);

    const barCtx = document.getElementById('trendChart').getContext('2d');
    if (chartTrend) chartTrend.destroy();

    chartTrend = new Chart(barCtx, {
        type: 'bar', // [SỬA] Đổi từ line sang bar
        data: {
            labels: labels,
            datasets: [
                {
                    label: 'Sản phẩm Lỗi (NG)',
                    data: ngData,
                    backgroundColor: '#ff3333', // Màu đỏ cho lỗi
                    barThickness: 'flex',
                    maxBarThickness: 30
                },
                {
                    label: 'Sản phẩm Đạt (OK)',
                    data: okData,
                    backgroundColor: '#00ff66', // Màu xanh cho OK
                    barThickness: 'flex',
                    maxBarThickness: 30
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                x: { 
                    stacked: true, // [SỬA] Chồng cột lên nhau
                    ticks: { color: '#94a3b8' }, 
                    grid: { display: false } 
                },
                y: { 
                    stacked: true, // [SỬA] Chồng cột lên nhau
                    beginAtZero: true, 
                    ticks: { stepSize: 1, color: '#94a3b8' }, 
                    grid: { color: '#2d333b' } 
                }
            },
            plugins: { 
                legend: { labels: { color: '#94a3b8' } },
                tooltip: {
                    mode: 'index',
                    intersect: false
                }
            }
        }
    });
}

function exportToCSV() {
    const filterType = document.getElementById('timeFilter').value;
    const dataToExport = filterDataByTime(allData, filterType);

    if (!dataToExport.length) {
        alert("Không có dữ liệu để xuất!");
        return;
    }
    
    let csvContent = "\uFEFF"; 
    csvContent += "ID,Time,Status,Defect Type,Confidence,Process Time (ms)\n";

    dataToExport.forEach(row => {
        csvContent += `${row.id},${row.timestamp},${row.status},"${row.defect_type}",${row.confidence},${row.process_time}\n`;
    });

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `report_${filterType}_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}