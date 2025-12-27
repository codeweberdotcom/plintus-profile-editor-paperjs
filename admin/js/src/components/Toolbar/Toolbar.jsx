import React from 'react';
import ToolButton from './ToolButton';
import { useEditorStore } from '../../store/useEditorStore';
import './Toolbar.css';

function Toolbar() {
    const { selectedTool, setSelectedTool, grid, toggleMajorLines, dimensionsVisible, toggleDimensionsVisible, orthogonalSnap, toggleOrthogonalSnap } = useEditorStore();

    const tools = [
        { id: 'line', label: 'Рисование', icon: 'uil-edit-alt' },
        { id: 'select', label: 'Редактировать', icon: 'uil-vector-square' },
        { id: 'arc', label: 'Радиус', icon: 'uil-circle' },
        { id: 'delete', label: 'Удаление', icon: 'uil-trash-alt' },
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
                        toggleOrthogonalSnap();
                    }}
                    className={orthogonalSnap ? 'active' : ''}
                    title="Toggle Orthogonal Snap"
                >
                    <i className="fs-28 uil uil-vector-square-alt"></i>
                </button>
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
                    <i className="fs-28 uil uil-grids"></i>
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
                    <i className="fs-28 uil uil-ruler"></i>
                </button>
            </div>
        </div>
    );
}

export default Toolbar;


