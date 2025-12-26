import { create } from 'zustand';

export const useEditorStore = create((set, get) => ({
    // State
    elements: [],
    selectedElements: [],
    selectedTool: 'select', // 'line', 'arc', 'select', 'delete'
    grid: {
        stepMM: 1,
        snap: true,
        visible: true,
        showMajorLines: false,
    },
    dimensionsVisible: true,
    viewbox: {
        x: 0,
        y: 0,
        width: 800,
        height: 400,
    },
    isDrawing: false,
    currentLineStart: null,
    
    // Actions
    setSelectedTool: (tool) => set({ selectedTool: tool, selectedElements: [] }),
    addElement: (element) => set((state) => ({
        elements: [...state.elements, { ...element, id: `element-${Date.now()}-${Math.random()}` }],
    })),
    updateElement: (id, updates) => set((state) => ({
        elements: state.elements.map((el) =>
            el.id === id ? { ...el, ...updates } : el
        ),
    })),
    deleteElement: (id) => set((state) => ({
        elements: state.elements.filter((el) => el.id !== id),
        selectedElements: state.selectedElements.filter((el) => el.id !== id),
    })),
    deleteSelectedElements: () => set((state) => {
        const selectedIds = new Set(state.selectedElements.map(el => el.id));
        return {
            elements: state.elements.filter((el) => !selectedIds.has(el.id)),
            selectedElements: [],
        };
    }),
    selectElement: (element, isMultiSelect = false) => {
        return set((state) => {
            if (!element) {
                return { selectedElements: [] };
            }
            
            if (isMultiSelect) {
                const exists = state.selectedElements.some(el => el.id === element.id);
                if (exists) {
                    return { selectedElements: state.selectedElements.filter(el => el.id !== element.id) };
                } else {
                    return { selectedElements: [...state.selectedElements, element] };
                }
            } else {
                return { selectedElements: [element] };
            }
        });
    },
    loadProfile: (data) => set({
        elements: data.elements || [],
        grid: data.grid || { stepMM: 1, snap: true, visible: true, showMajorLines: false },
        viewbox: data.viewbox || { x: 0, y: 0, width: 800, height: 400 },
    }),
    setCurrentLineStart: (point) => set({ currentLineStart: point }),
    setIsDrawing: (isDrawing) => set({ isDrawing }),
    toggleDimensionsVisible: () => set((state) => ({
        dimensionsVisible: !state.dimensionsVisible,
    })),
    toggleMajorLines: () => set((state) => ({
        grid: { ...state.grid, showMajorLines: !state.grid.showMajorLines },
    })),
}));

