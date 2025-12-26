<?php
namespace PlintusProfileEditorPaperjs;

class CPT {
    const POST_TYPE = 'plintus_pjs';

    public function register() {
        $labels = [
            'name'                  => __('Profiles (Paper.js)', 'plintus-profile-editor-paperjs'),
            'singular_name'         => __('Profile', 'plintus-profile-editor-paperjs'),
            'menu_name'             => __('Plintus PJS', 'plintus-profile-editor-paperjs'),
            'add_new'               => __('Add New', 'plintus-profile-editor-paperjs'),
            'add_new_item'          => __('Add New Profile', 'plintus-profile-editor-paperjs'),
            'edit_item'             => __('Edit Profile', 'plintus-profile-editor-paperjs'),
            'new_item'              => __('New Profile', 'plintus-profile-editor-paperjs'),
            'view_item'             => __('View Profile', 'plintus-profile-editor-paperjs'),
            'search_items'          => __('Search Profiles', 'plintus-profile-editor-paperjs'),
            'not_found'             => __('No profiles found', 'plintus-profile-editor-paperjs'),
            'not_found_in_trash'    => __('No profiles found in trash', 'plintus-profile-editor-paperjs'),
        ];

        $args = [
            'labels'              => $labels,
            'public'              => false,
            'show_ui'             => true,
            'show_in_menu'        => true,
            'menu_icon'           => 'dashicons-admin-customizer',
            'capability_type'     => 'post',
            'hierarchical'        => false,
            'supports'            => ['title', 'author'],
            'has_archive'         => false,
            'rewrite'             => false,
            'query_var'           => false,
            'show_in_rest'        => true,
            'rest_base'           => 'plintus-pjs',
            'rest_controller_class' => 'WP_REST_Posts_Controller',
        ];

        register_post_type(self::POST_TYPE, $args);
    }
}

