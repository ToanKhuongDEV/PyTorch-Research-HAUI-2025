/**
 * State Management Module
 * Quản lý state của ứng dụng (mảng ảnh, metadata, pagination)
 */

class AppStore {
    constructor() {
        this.capturedImages = [];
        this.imageMetadata = [];
        this.currentPage = 1;
        this.imagesPerPage = 6;
    }

    // Thêm ảnh vào store
    addImage(imageData) {
        this.capturedImages.push(imageData);
        this.imageMetadata.push(imageData); // Placeholder, will be updated by metadata module
    }

    // Cập nhật metadata
    updateMetadata(index, metadata) {
        this.imageMetadata[index] = metadata;
    }

    // Lấy metadata
    getMetadata(index) {
        return this.imageMetadata[index] || {};
    }

    // Lấy danh sách ảnh
    getImages() {
        return this.capturedImages;
    }

    // Lấy ảnh cụ thể
    getImage(index) {
        return this.capturedImages[index];
    }

    // Lấy số lượng ảnh
    getImageCount() {
        return this.capturedImages.length;
    }

    // Xóa tất cả
    clearAll() {
        this.capturedImages = [];
        this.imageMetadata = [];
        this.currentPage = 1;
    }

    // Pagination getters
    getCurrentPage() {
        return this.currentPage;
    }

    setCurrentPage(page) {
        this.currentPage = page;
    }

    getImagesPerPage() {
        return this.imagesPerPage;
    }

    // Lấy ảnh cho trang hiện tại
    getCurrentPageImages() {
        const totalImages = this.capturedImages.length;
        const totalPages = Math.ceil(totalImages / this.imagesPerPage);

        const startIndexFromEnd = (this.currentPage - 1) * this.imagesPerPage;
        const endIndexFromEnd = startIndexFromEnd + this.imagesPerPage;
        
        const realEndIndex = totalImages - startIndexFromEnd;
        const realStartIndex = Math.max(0, totalImages - endIndexFromEnd);

        const pageImages = this.capturedImages.slice(realStartIndex, realEndIndex);

        return {
            images: pageImages.reverse(),
            startIndex: realStartIndex,
            endIndex: realEndIndex,
            totalPages: totalPages
        };
    }
}

// Export class for instantiation in main.js
// const appStore = new AppStore();
