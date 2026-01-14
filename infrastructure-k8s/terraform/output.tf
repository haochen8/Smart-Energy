output "ssh_command" {
  description = "SSH command to connect to the k3s server"
  value       = "ssh -i ${var.identity_file} ubuntu@${openstack_networking_floatingip_v2.k3s_floatingip.address}"
}

output "cp_ips" {
  description = "IPv4 addresses assigned to the control plane nodes"
  value       = openstack_compute_instance_v2.k3s_cp[*].access_ip_v4
}

output "worker_ips" {
  description = "IPv4 addresses assigned to the worker nodes"
  value       = openstack_compute_instance_v2.k3s_worker[*].access_ip_v4
}
