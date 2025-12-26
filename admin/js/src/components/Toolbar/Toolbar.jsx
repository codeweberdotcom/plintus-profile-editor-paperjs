import React from 'react';
import ToolButton from './ToolButton';
import { useEditorStore } from '../../store/useEditorStore';
import './Toolbar.css';

function Toolbar() {
    const { selectedTool, setSelectedTool, grid, toggleMajorLines, dimensionsVisible, toggleDimensionsVisible } = useEditorStore();

    const tools = [
        { id: 'select', label: 'Select', icon: 'uil-vector-square' },
        { id: 'line', label: 'Line', icon: 'uil-edit-alt' },
        { id: 'arc', label: 'Arc', icon: 'uil-circle' },
        { id: 'delete', label: 'Delete', icon: 'uil-trash-alt' },
    ];

    return (
        <div className="plintus-toolbar">
            <div className="plintus-toolbar-section">
                {tools.map((tool) => (
                    <ToolButton
                        key={tool.id}
                        tool={tool}
                        isActive={selectedTool === tool.id}
                        onClick={() => setSelectedTool(tool.id)}
                    />
                ))}
            </div>

            <div className="plintus-toolbar-section plintus-toolbar-section-right">
                <button
                    type="button"
                    onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        toggleMajorLines();
                    }}
                    className={grid.showMajorLines ? 'active' : ''}
                    title="Show/Hide Major Grid Lines (10mm)"
                >
                    <i className="uil uil-grids"></i>
                </button>
                <button
                    type="button"
                    onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        toggleDimensionsVisible();
                    }}
                    className={dimensionsVisible ? 'active' : ''}
                    title="Show/Hide Dimensions"
                >
                    <i className="uil uil-ruler"></i>
                </button>
            </div>
        </div>
    );
}

export default Toolbar;

