#--------------------------------------------------------------------
# Data sources
#

# Fetch the most recent image ID based on the provided image name
data "openstack_images_image_v2" "image" {
  name        = var.image_name
  most_recent = true
}

# Fetch the flavor ID based on the provided flavor name
data "openstack_compute_flavor_v2" "flavor" {
  name = var.flavor_name
}

# Fetch the external network ID based on the provided network name
data "openstack_networking_network_v2" "extnet" {
  name = var.external_network_name
}

# Fetch the default security group
data "openstack_networking_secgroup_v2" "secgroup_default" {
  name = "default"
}

# Load the cloud_init configuration from a file (no variables needed)
locals {
  cloud_init = file("${path.module}/templates/cloud_init.yaml")
}
