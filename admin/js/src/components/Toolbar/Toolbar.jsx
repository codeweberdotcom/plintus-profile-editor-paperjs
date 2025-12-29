import React from 'react';
import ToolButton from './ToolButton';
import { useEditorStore } from '../../store/useEditorStore';
import './Toolbar.css';

function Toolbar() {
    const { selectedTool, setSelectedTool } = useEditorStore();

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
        </div>
    );
}

export default Toolbar;


