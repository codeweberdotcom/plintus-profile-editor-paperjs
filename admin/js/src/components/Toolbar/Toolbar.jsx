import React from 'react';
import ToolButton from './ToolButton';
import { useEditorStore } from '../../store/useEditorStore';
import './Toolbar.css';

function Toolbar() {
    const { selectedTool, setSelectedTool, dimensionsVisible, toggleDimensionsVisible, zoomIn, zoomOut, resetZoom } = useEditorStore();

    const tools = [
        { id: 'line', label: 'Рисование', icon: 'uil-edit-alt' },
        { id: 'select', label: 'Редактировать', icon: 'uil-vector-square' },
        { id: 'arc', label: 'Скругление', icon: 'uil-circle' },
        { id: 'chamfer', label: 'Фаска', icon: 'uil-angle-double-down' },
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
                {/* Кнопки управления масштабом */}
                <button
                    type="button"
                    onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        resetZoom();
                    }}
                    title="Сброс масштаба"
                >
                    <i className="fs-28 uil uil-expand-arrows-alt"></i>
                </button>
                <button
                    type="button"
                    onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        zoomOut();
                    }}
                    title="Уменьшить"
                >
                    <i className="fs-28 uil uil-minus-circle"></i>
                </button>
                <button
                    type="button"
                    onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        zoomIn();
                    }}
                    title="Приблизить"
                >
                    <i className="fs-28 uil uil-plus-circle"></i>
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


