import React from 'react';
import { useEditorStore } from '../../store/useEditorStore';
import './VerticalToolbar.css';

function VerticalToolbar() {
    const { selectedTool, setSelectedTool } = useEditorStore();

    const tools = [
        { id: 'line', label: 'Рисование', icon: 'uil-edit-alt' },
        { id: 'select', label: 'Редактировать', icon: 'uil-vector-square' },
        { id: 'arc', label: 'Радиус', icon: 'uil-circle' },
        { id: 'delete', label: 'Удаление', icon: 'uil-trash-alt' },
    ];

    return (
        <div className="plintus-vertical-toolbar">
            {tools.map((tool) => (
                <button
                    key={tool.id}
                    type="button"
                    className={`plintus-vertical-tool-button ${selectedTool === tool.id ? 'active' : ''}`}
                    onClick={() => setSelectedTool(tool.id)}
                    title={tool.label}
                >
                    <i className={`fs-28 uil ${tool.icon}`}></i>
                    <span className="plintus-vertical-tool-button-text">{tool.label}</span>
                </button>
            ))}
        </div>
    );
}

export default VerticalToolbar;

