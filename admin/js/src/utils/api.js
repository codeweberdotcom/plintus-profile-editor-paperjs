// Функция для получения API_BASE и NONCE (может быть из window.plintusEditor или window.plintusEditorInstances)
function getApiConfig() {
    let apiUrl = window.plintusEditor?.apiUrl || '/wp-json/plintus-paperjs/v1/';
    let nonce = window.plintusEditor?.nonce || '';
    
    // Если это фронтенд (шорткод), данные могут быть в window.plintusEditorInstances
    if (!nonce && typeof window.plintusEditorInstances !== 'undefined') {
        const containerId = document.querySelector('.plintus-editor-container')?.id;
        if (containerId && window.plintusEditorInstances[containerId]) {
            const editorData = window.plintusEditorInstances[containerId];
            apiUrl = editorData.apiUrl || apiUrl;
            nonce = editorData.nonce || nonce;
        }
    }
    
    return { apiUrl, nonce };
}

// Определяем, находимся ли мы в админке
const IS_ADMIN = typeof window.location !== 'undefined' && window.location.href.includes('/wp-admin/');

export async function loadProfileData(profileId) {
    try {
        const { apiUrl } = getApiConfig();
        
        // Для GET-запросов не передаем nonce на фронтенде
        // На фронтенде permission_callback = __return_true, поэтому nonce не нужен
        const headers = {};
        
        const response = await fetch(`${apiUrl}profiles/${profileId}/data`, {
            method: 'GET',
            headers: headers,
            credentials: 'same-origin', // Важно для работы с cookies
        });
        
        if (!response.ok) {
            const errorText = await response.text();
            console.error('Failed to load profile data:', response.status, response.statusText, errorText);
            // Если это 403 и мы на фронтенде, это может быть нормально - просто возвращаем null
            if (response.status === 403) {
                console.warn('Access denied to profile data. This may be expected on frontend.');
                return null;
            }
            throw new Error(`Failed to load profile data: ${response.status} ${response.statusText}`);
        }
        
        return await response.json();
    } catch (error) {
        console.error('Error loading profile data:', error);
        return null;
    }
}

export async function saveProfileData(profileId, data) {
    try {
        const { apiUrl, nonce } = getApiConfig();
        
        // Проверяем наличие nonce перед отправкой
        if (!nonce) {
            // Без nonce не пытаемся сохранять
            return null;
        }
        
        const response = await fetch(`${apiUrl}profiles/${profileId}/data`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-WP-Nonce': nonce,
            },
            credentials: 'same-origin', // Важно для работы с cookies
            body: JSON.stringify({ data }),
        });
        
        if (!response.ok) {
            // Если это 403, это может быть ожидаемо (пользователь не авторизован или нет прав)
            if (response.status === 403) {
                // Тихая обработка - не выводим в консоль
                return null;
            }
            const errorText = await response.text();
            console.error('Failed to save profile data:', response.status, response.statusText, errorText);
            throw new Error(`Failed to save profile data: ${response.status} ${response.statusText}`);
        }
        
        return await response.json();
    } catch (error) {
        // Не выводим ошибку для NetworkError или 403 - это может быть ожидаемо
        if (error.message && (error.message.includes('403') || error.message.includes('NetworkError'))) {
            // Тихая обработка - не выводим в консоль
            return null;
        }
        // Выводим только реальные ошибки
        console.error('Error saving profile data:', error);
        return null;
    }
}






