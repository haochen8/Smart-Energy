resource "openstack_compute_instance_v2" "k3s_cp" {
  count = var.cp_count

  depends_on = [
    openstack_networking_router_interface_v2.router_interface
  ]

  name              = "k3s-cp-${count.index}"
  image_id          = data.openstack_images_image_v2.image.id
  flavor_id         = data.openstack_compute_flavor_v2.flavor.id
  key_pair          = var.key_pair_name
  availability_zone = "Education"
  user_data         = local.cloud_init

  network {
    port = openstack_networking_port_v2.k3s_cp_port[count.index].id
  }
}

resource "openstack_compute_instance_v2" "k3s_worker" {
  count = var.worker_count

  depends_on = [
    openstack_networking_router_interface_v2.router_interface
  ]

  name              = "k3s-worker-${count.index}"
  image_id          = data.openstack_images_image_v2.image.id
  flavor_id         = data.openstack_compute_flavor_v2.flavor.id
  key_pair          = var.key_pair_name
  availability_zone = "Education"
  user_data         = local.cloud_init

  network {
    port = openstack_networking_port_v2.k3s_worker_port[count.index].id
  }
}
