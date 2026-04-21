class DatasetStore {
  constructor() {
    this.datasets = new Map();
  }

  set(id, dataset) {
    this.datasets.set(id, dataset);
  }

  get(id) {
    return this.datasets.get(id);
  }

  has(id) {
    return this.datasets.has(id);
  }

  delete(id) {
    return this.datasets.delete(id);
  }

  list() {
    return Array.from(this.datasets.entries()).map(([id, dataset]) => ({ id, ...dataset }));
  }

  size() {
    return this.datasets.size;
  }

  clear() {
    this.datasets.clear();
  }
}

module.exports = new DatasetStore();
