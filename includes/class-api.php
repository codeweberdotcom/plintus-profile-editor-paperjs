<?php
namespace PlintusProfileEditorPaperjs;

class API {
    public function register_routes() {
        register_rest_route('plintus-paperjs/v1', '/profiles/(?P<id>\d+)/data', [
            'methods' => 'GET',
            'callback' => [$this, 'get_profile_data'],
            'permission_callback' => '__return_true', // Разрешаем чтение всем
        ]);

        register_rest_route('plintus-paperjs/v1', '/profiles/(?P<id>\d+)/data', [
            'methods' => 'POST',
            'callback' => [$this, 'save_profile_data'],
            'permission_callback' => [$this, 'check_permission'],
        ]);

        register_rest_route('plintus-paperjs/v1', '/profiles/(?P<id>\d+)/export', [
            'methods' => 'GET',
            'callback' => [$this, 'export_profile'],
            'permission_callback' => '__return_true', // Разрешаем экспорт всем
        ]);
    }

    public function check_permission($request) {
        $method = $request->get_method();
        
        // Для GET запросов (чтение) разрешаем всем
        if ($method === 'GET') {
            return true;
        }
        
        // Для POST запросов (сохранение) требуем права редактирования
        // Проверяем nonce из заголовка
        $nonce = $request->get_header('X-WP-Nonce');
        if (!$nonce) {
            // Пробуем получить из параметров запроса
            $nonce = $request->get_param('_wpnonce');
        }
        
        // Если nonce передан, проверяем его
        if ($nonce) {
            $nonce_valid = wp_verify_nonce($nonce, 'wp_rest');
            if ($nonce_valid && current_user_can('edit_posts')) {
                return true;
            }
        }
        
        // Если nonce не передан или неверный, проверяем только права (для админки)
        // Это позволяет работать в админке без nonce (через cookies)
        return current_user_can('edit_posts');
    }

    public function get_profile_data($request) {
        $profile_id = (int) $request['id'];
        $profile = get_post($profile_id);

        if (!$profile || $profile->post_type !== CPT::POST_TYPE) {
            return new \WP_Error('not_found', 'Profile not found', ['status' => 404]);
        }

        $data = get_post_meta($profile_id, '_profile_data', true);
        
        return rest_ensure_response([
            'id' => $profile_id,
            'data' => $data ? json_decode($data, true) : $this->get_default_data(),
        ]);
    }

    public function save_profile_data($request) {
        $profile_id = (int) $request['id'];
        $profile = get_post($profile_id);

        if (!$profile || $profile->post_type !== CPT::POST_TYPE) {
            return new \WP_Error('not_found', 'Profile not found', ['status' => 404]);
        }

        $body = $request->get_json_params();
        $data = isset($body['data']) ? $body['data'] : null;

        if (!$data) {
            return new \WP_Error('invalid_data', 'Invalid data', ['status' => 400]);
        }

        update_post_meta($profile_id, '_profile_data', wp_json_encode($data));

        return rest_ensure_response([
            'success' => true,
            'id' => $profile_id,
        ]);
    }

    public function export_profile($request) {
        $profile_id = (int) $request['id'];
        $profile = get_post($profile_id);

        if (!$profile || $profile->post_type !== CPT::POST_TYPE) {
            return new \WP_Error('not_found', 'Profile not found', ['status' => 404]);
        }

        $data = get_post_meta($profile_id, '_profile_data', true);
        
        return rest_ensure_response([
            'id' => $profile_id,
            'name' => $profile->post_title,
            'data' => $data ? json_decode($data, true) : $this->get_default_data(),
        ]);
    }

    private function get_default_data() {
        return [
            'elements' => [],
            'grid' => [
                'stepMM' => 1,
                'snap' => true,
                'visible' => true,
            ],
            'viewbox' => [
                'x' => 0,
                'y' => 0,
                'width' => 800,
                'height' => 400,
            ],
        ];
    }
}






